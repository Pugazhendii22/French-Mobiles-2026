import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { db } from '../firebase/firebase';
import { collection, getDocs } from 'firebase/firestore';
import Layout from '../components/common/Layout';

const Dashboard = () => {
  const { userRole, currentUser, userName } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState({
    salesTodayAmt: 0,
    salesTodayCount: 0,
    pendingOrders: 0,
    overdueOrders: 0,
    dueTodayOrders: 0,
    lowStockCount: 0,
    pendingBillsAmt: 0,
    totalCustomers: 0,
    customersToday: 0,
    openEnquiries: 0,
  });

  const [recentOrders, setRecentOrders] = useState([]);

  const [tasksInfo, setTasksInfo] = useState({
    totalPending: 0,
    overdue: 0,
    list: []
  });

  // Time of Day Logic
  const timeOfDayGreeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Good morning';
    if (hour >= 12 && hour < 17) return 'Good afternoon';
    if (hour >= 17 && hour < 21) return 'Good evening';
    return 'Good night';
  }, []);

  const formattedDate = useMemo(() => {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    }).format(new Date());
  }, []);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

        // Fetch all data in parallel for better performance
        const [
          salesSnap,
          prodSnap,
          srvSnap,
          custSnap,
          enqSnap,
          tasksSnap
        ] = await Promise.all([
          getDocs(collection(db, 'sales')),
          getDocs(collection(db, 'products')),
          getDocs(collection(db, 'service_orders')),
          getDocs(collection(db, 'customers')),
          getDocs(collection(db, 'enquiries')),
          getDocs(collection(db, 'tasks'))
        ]);

        const newStats = {
          salesTodayAmt: 0, salesTodayCount: 0,
          pendingOrders: 0, overdueOrders: 0, dueTodayOrders: 0,
          lowStockCount: 0, pendingBillsAmt: 0,
          totalCustomers: 0, customersToday: 0, openEnquiries: 0
        };

        // 1. Process Sales
        salesSnap.forEach(d => {
          const s = d.data();
          if (s.createdAt?.startsWith(todayStr) || (s.createdAt?.toDate && s.createdAt.toDate() >= startToday && s.createdAt.toDate() < endToday)) {
            newStats.salesTodayCount++;
            newStats.salesTodayAmt += Number(s.totalAmount) || 0;
          }
          if (Number(s.balanceDue) > 0) {
            newStats.pendingBillsAmt += Number(s.balanceDue);
          }
        });

        // 2. Process Products
        prodSnap.forEach(d => {
          const p = d.data();
          if (Number(p.stock) <= Number(p.threshold || 5)) {
            newStats.lowStockCount++;
          }
        });

        // 3. Process Service Orders
        const allOrders = [];
        srvSnap.forEach(d => {
          const srv = d.data();
          const expected = srv.expectedCompletionAt?.toDate ? srv.expectedCompletionAt.toDate() : new Date(srv.expectedCompletionAt);
          const isCompleted = srv.status === 'Completed' || srv.status === 'Returned' || srv.status === 'Delivered';

          if (!isCompleted) {
            newStats.pendingOrders++;

            if (expected instanceof Date && !Number.isNaN(expected.getTime())) {
              if (expected < now) {
                newStats.overdueOrders++;
              } else if (expected >= startToday && expected < endToday) {
                newStats.dueTodayOrders++;
              }
            }
          }
          allOrders.push({ id: d.id, ...srv });
        });

        // Sort orders by createdAt desc for recent 5
        allOrders.sort((a, b) => {
          const da = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime();
          const db = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime();
          return (db || 0) - (da || 0);
        });
        setRecentOrders(allOrders.slice(0, 5));

        // 4. Process Customers
        newStats.totalCustomers = custSnap.size;
        custSnap.forEach(d => {
          const c = d.data();
          if (c.createdAt?.startsWith(todayStr) || (c.createdAt?.toDate && c.createdAt.toDate() >= startToday && c.createdAt.toDate() < endToday)) {
            newStats.customersToday++;
          }
        });

        // 5. Process Enquiries
        enqSnap.forEach(d => {
          if (d.data().status === 'Open') newStats.openEnquiries++;
        });

        setStats(newStats);

        // 6. Process Tasks
        let tPend = 0, tOver = 0;
        const tList = [];
        tasksSnap.forEach(d => {
          const t = d.data();
          if (t.status === 'pending') {
            if (userRole?.toLowerCase() === 'admin' || t.assignedTo === currentUser?.uid) {
              tPend++;
              const due = t.dueDate?.toDate ? t.dueDate.toDate() : new Date(t.dueDate);
              if (due instanceof Date && !Number.isNaN(due.getTime()) && due < now) {
                tOver++;
              }
              tList.push({ id: d.id, ...t, due });
            }
          }
        });
        // Sort tasks by due date ascending
        tList.sort((a, b) => (a.due?.getTime() || 0) - (b.due?.getTime() || 0));
        setTasksInfo({
          totalPending: tPend,
          overdue: tOver,
          list: tList.slice(0, 3)
        });

      } catch (err) {
        console.error("Dashboard fetch error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchDashboardData();
  }, [userRole, currentUser?.uid]);

  const getTimeAgo = (dateVal) => {
    if (!dateVal) return '';
    const date = dateVal instanceof Date ? dateVal : (dateVal?.toDate ? dateVal.toDate() : new Date(dateVal));
    if (Number.isNaN(date.getTime())) return '';
    const diff = new Date().getTime() - date.getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) {
      const min = Math.floor(diff / 60000);
      return min <= 1 ? 'Just now' : `${min} mins ago`;
    }
    if (hours < 24) return `${hours} hrs ago`;
    return `${Math.floor(hours / 24)} days ago`;
  };

  const getStatusColor = (status) => {
    const s = (status || '').toLowerCase();
    if (s.includes('pending') || s.includes('received')) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    if (s.includes('progress')) return 'bg-blue-100 text-blue-800 border-blue-200';
    if (s.includes('complete') || s.includes('delivered')) return 'bg-green-100 text-green-800 border-green-200';
    if (s.includes('awaiting')) return 'bg-orange-100 text-orange-800 border-orange-200';
    return 'bg-gray-100 text-gray-800 border-gray-200';
  };

  return (
    <Layout title="Dashboard" pageType="dashboard">
      <div className="bg-[#f8fafc] min-h-screen">
        <div className="max-w-7xl mx-auto">

          {/* PART 7 - ALERT BANNERS */}
          {!loading && userRole?.toLowerCase() === 'admin' && stats.overdueOrders > 0 && (
            <div className="bg-[#ED2939] text-white rounded-xl p-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md w-full">
              <span className="font-medium flex items-center">
                <i className="fas fa-exclamation-triangle mr-3 text-xl"></i>
                {stats.overdueOrders} service order{stats.overdueOrders > 1 ? 's are' : ' is'} overdue!
              </span>
              <button onClick={() => navigate('/service')} className="underline font-bold text-white hover:text-red-100 shrink-0 self-start sm:self-auto">View Now</button>
            </div>
          )}

          {!loading && userRole?.toLowerCase() === 'staff' && tasksInfo.overdue > 0 && (
            <div className="bg-orange-500 text-white rounded-xl p-4 mb-6 shadow-md w-full font-medium flex items-center">
              <i className="fas fa-clock mr-3 text-xl"></i>
              You have {tasksInfo.overdue} overdue task{tasksInfo.overdue > 1 ? 's' : ''}.
            </div>
          )}

          {/* PART 2 - GREETING HEADER */}
          <div className="mb-8">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-[#0f172a] break-words">
              {timeOfDayGreeting}, {userName || currentUser?.email?.split('@')[0] || 'User'} 👋
            </h1>
            <p className="text-[#64748b] mt-1 text-sm md:text-base">
              Here's what's happening at French Mobiles today.
            </p>
            <p className="text-xs md:text-sm text-[#64748b] mt-1 font-medium">{formattedDate}</p>
          </div>

          {/* PART 8 - QUICK ACTIONS ROW */}
          <div className="flex overflow-x-auto gap-3 mb-6 pb-2 sm:flex-wrap w-full hide-scrollbar">
            <button onClick={() => navigate('/service')} className="bg-[#002395] text-white rounded-xl px-5 py-2.5 font-semibold shrink-0 shadow-sm hover:bg-blue-800 transition">
              <i className="fas fa-plus mr-2"></i>New Service Order
            </button>
            <button onClick={() => navigate('/inventory/second-hand')} className="bg-white border-2 border-[#002395] text-[#002395] rounded-xl px-5 py-2.5 font-semibold shrink-0 shadow-sm hover:bg-blue-50 transition">
              <i className="fas fa-mobile-alt mr-2"></i>Add Mobile
            </button>
            <button onClick={() => navigate('/sales')} className="bg-white border-2 border-[#ED2939] text-[#ED2939] rounded-xl px-5 py-2.5 font-semibold shrink-0 shadow-sm hover:bg-red-50 transition">
              <i className="fas fa-receipt mr-2"></i>New Sale
            </button>
            <button onClick={() => navigate('/scanner')} className="bg-white border border-gray-200 text-gray-600 rounded-xl px-5 py-2.5 font-semibold shrink-0 shadow-sm hover:bg-gray-50 transition">
              <i className="fas fa-qrcode mr-2"></i>Scan Label
            </button>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              {[...Array(3)].map((_, i) => <div key={i} className="bg-white rounded-2xl h-40 animate-pulse shadow-sm"></div>)}
            </div>
          ) : (
            <>
              {/* PART 3 - ROW 1: BIG 3 STATS */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">

                {/* Card 1 - Today's Sales */}
                <div onClick={() => navigate('/sales')} className="relative overflow-visible rounded-2xl p-6 shadow-lg cursor-pointer hover:shadow-xl transition-all hover:-translate-y-1" style={{ background: 'linear-gradient(135deg, #002395, #0037d4)' }}>
                  <i className="fas fa-indian-rupee-sign absolute top-6 right-6 text-6xl text-white opacity-20"></i>
                  <div className="relative z-10">
                    <p className="text-white/90 font-medium tracking-wide">Today's Sales</p>
                    <p className="text-white text-3xl md:text-4xl font-bold mt-2 mb-1">₹{stats.salesTodayAmt.toLocaleString()}</p>
                    <p className="text-white/80 text-sm">{stats.salesTodayCount} transaction{stats.salesTodayCount !== 1 ? 's' : ''} today</p>
                    <div className="mt-4 inline-block bg-white/20 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-white/30 transition">
                      View Sales →
                    </div>
                  </div>
                </div>

                {/* Card 2 - Pending Orders */}
                <div onClick={() => navigate('/service')} className="relative overflow-visible rounded-2xl p-6 shadow-lg cursor-pointer hover:shadow-xl transition-all hover:-translate-y-1" style={{ background: 'linear-gradient(135deg, #ED2939, #c41e2a)' }}>
                  <i className="fas fa-tools absolute top-6 right-6 text-6xl text-white opacity-20"></i>
                  <div className="relative z-10">
                    <p className="text-white/90 font-medium tracking-wide">Pending Orders</p>
                    <p className="text-white text-3xl md:text-4xl font-bold mt-2 mb-1">{stats.pendingOrders}</p>
                    <p className="text-white/80 text-sm">Awaiting completion</p>
                    <div className="mt-4 inline-block bg-white/20 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-white/30 transition">
                      View Orders →
                    </div>
                  </div>
                </div>

                {/* Card 3 - Overdue Orders */}
                <div onClick={() => navigate('/service')} className="relative overflow-visible rounded-2xl p-6 shadow-lg cursor-pointer hover:shadow-xl transition-all hover:-translate-y-1" style={{ background: 'linear-gradient(135deg, #0f172a, #1e293b)' }}>
                  <i className="fas fa-exclamation-circle absolute top-6 right-6 text-6xl text-white opacity-20"></i>
                  <div className="relative z-10">
                    <p className="text-white/90 font-medium tracking-wide">Overdue Orders</p>
                    <p className={`text-3xl md:text-4xl font-bold mt-2 mb-1 ${stats.overdueOrders > 0 ? 'text-[#ED2939]' : 'text-white'}`}>{stats.overdueOrders}</p>
                    <p className="text-white/80 text-sm">Past deadline</p>
                    <div className="mt-4 inline-block bg-white/20 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-white/30 transition">
                      View Overdue →
                    </div>
                  </div>
                </div>

              </div>

              {/* PART 4 - ROW 2: SECONDARY STATS */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div onClick={() => navigate('/service')} className="bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition cursor-pointer border border-[#e2e8f0] border-l-4 border-orange-400 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center shrink-0">
                    <i className="fas fa-clock text-orange-400 text-lg"></i>
                  </div>
                  <div>
                    <p className="text-sm text-[#64748b] font-medium">Due Today</p>
                    <p className="text-xl font-bold text-orange-500">{stats.dueTodayOrders}</p>
                    <p className="text-xs text-[#64748b]">Service orders</p>
                  </div>
                </div>
                <div onClick={() => navigate('/products')} className="bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition cursor-pointer border border-[#e2e8f0] border-l-4 border-yellow-400 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-yellow-50 flex items-center justify-center shrink-0">
                    <i className="fas fa-box text-yellow-400 text-lg"></i>
                  </div>
                  <div>
                    <p className="text-sm text-[#64748b] font-medium">Low Stock</p>
                    <p className="text-xl font-bold text-yellow-500">{stats.lowStockCount}</p>
                    <p className="text-xs text-[#64748b]">Products need restock</p>
                  </div>
                </div>
                {userRole?.toLowerCase() === 'admin' && (
                  <div onClick={() => navigate('/due-payments')} className="bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition cursor-pointer border border-[#e2e8f0] border-l-4 border-[#ED2939] flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                      <i className="fas fa-rupee-sign text-[#ED2939] text-lg"></i>
                    </div>
                    <div>
                      <p className="text-sm text-[#64748b] font-medium">Due Payments</p>
                      <p className="text-xl font-bold text-[#ED2939]">₹{stats.pendingBillsAmt.toLocaleString()}</p>
                      <p className="text-xs text-[#64748b]">Pending from customers</p>
                    </div>
                  </div>
                )}
                {userRole?.toLowerCase() !== 'admin' && (
                  <div onClick={() => navigate('/sales')} className="bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition cursor-pointer border border-[#e2e8f0] border-l-4 border-purple-400 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center shrink-0">
                      <i className="fas fa-file-invoice text-purple-400 text-lg"></i>
                    </div>
                    <div>
                      <p className="text-sm text-[#64748b] font-medium">Pending Bills</p>
                      <p className="text-xl font-bold text-purple-500">₹{stats.pendingBillsAmt.toLocaleString()}</p>
                      <p className="text-xs text-[#64748b]">Balance due from customers</p>
                    </div>
                  </div>
                )}
              </div>

              {/* PART 5 - ROW 3: INFO STATS */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div onClick={() => navigate('/customers')} className="bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition cursor-pointer border border-[#e2e8f0] border-l-4 border-[#002395] flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                    <i className="fas fa-users text-[#002395] text-lg"></i>
                  </div>
                  <div>
                    <p className="text-sm text-[#64748b] font-medium">Total Customers</p>
                    <p className="text-xl font-bold text-[#002395]">{stats.totalCustomers}</p>
                  </div>
                </div>
                <div onClick={() => navigate('/customers')} className="bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition cursor-pointer border border-[#e2e8f0] border-l-4 border-green-400 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center shrink-0">
                    <i className="fas fa-user-plus text-green-500 text-lg"></i>
                  </div>
                  <div>
                    <p className="text-sm text-[#64748b] font-medium">New Today</p>
                    <p className="text-xl font-bold text-green-500">{stats.customersToday}</p>
                    <p className="text-xs text-[#64748b]">Customers received</p>
                  </div>
                </div>
                <div onClick={() => navigate('/enquiries')} className="bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition cursor-pointer border border-[#e2e8f0] border-l-4 border-[#ED2939] flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                    <i className="fas fa-question-circle text-[#ED2939] text-lg"></i>
                  </div>
                  <div>
                    <p className="text-sm text-[#64748b] font-medium">Open Enquiries</p>
                    <p className="text-xl font-bold text-[#ED2939]">{stats.openEnquiries}</p>
                  </div>
                </div>
              </div>

              {/* PART 6 - BOTTOM TWO COLUMN SECTION */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* LEFT COLUMN - Recent Service Orders */}
                <div className="bg-white rounded-2xl shadow-sm border border-[#e2e8f0] p-6 flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-[#0f172a] flex items-center">
                      <i className="fas fa-tools text-[#002395] mr-2"></i> Recent Service Orders
                    </h2>
                  </div>
                  <div className="flex-1 overflow-y-auto min-h-0 space-y-3 pr-1">
                    {recentOrders.length === 0 ? (
                      <p className="text-sm text-gray-500 italic py-4 text-center">No recent service orders found.</p>
                    ) : (
                      recentOrders.map(order => (
                        <div key={order.id} onClick={() => navigate(`/service/${order.id}`)} className="flex items-center justify-between p-3 border border-gray-100 rounded-xl hover:bg-slate-50 cursor-pointer transition shadow-sm">
                          <div className="min-w-0 pr-3">
                            <p className="text-[10px] font-bold text-[#002395] mb-0.5 tracking-wider uppercase">{order.orderNumber}</p>
                            <p className="text-sm font-semibold text-gray-900 truncate">{order.customerName}</p>
                            <p className="text-xs text-gray-500 truncate font-medium">{order.brand} {order.model}</p>
                          </div>
                          <div className="shrink-0 flex flex-col items-end gap-1">
                            <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border ${getStatusColor(order.status)}`}>
                              {order.status}
                            </span>
                            <span className="text-[10px] text-gray-400 font-bold uppercase">{getTimeAgo(order.createdAt)}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <button onClick={() => navigate('/service')} className="mt-4 w-full py-2.5 rounded-xl bg-slate-50 text-[#002395] font-bold text-sm hover:bg-blue-50 transition-colors border border-blue-100">
                    View All Orders →
                  </button>
                </div>

                {/* RIGHT COLUMN - Tasks Summary */}
                <div className="bg-white rounded-2xl shadow-sm border border-[#e2e8f0] p-6 flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-[#0f172a] flex items-center">
                      <i className="fas fa-tasks text-[#ED2939] mr-2"></i> {userRole?.toLowerCase() === 'admin' ? 'Tasks Summary' : 'My Tasks'}
                    </h2>
                  </div>

                  <div className="flex gap-4 mb-5 pb-4 border-b border-gray-100">
                    <div className="flex-1 bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                      <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">Pending</p>
                      <p className="text-2xl font-bold text-[#0f172a]">{tasksInfo.totalPending}</p>
                    </div>
                    <div className="flex-1 bg-red-50 rounded-xl p-3 text-center border border-red-100">
                      <p className="text-[10px] text-[#ED2939] uppercase font-bold mb-1">Overdue</p>
                      <p className="text-2xl font-bold text-[#ED2939]">{tasksInfo.overdue}</p>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto min-h-0 space-y-3 pr-1">
                    {tasksInfo.list.length === 0 ? (
                      <p className="text-sm text-gray-500 italic py-2 text-center">No urgent tasks.</p>
                    ) : (
                      tasksInfo.list.map(task => (
                        <div key={task.id} className="p-3 border border-gray-100 rounded-xl hover:bg-slate-50 transition shadow-sm">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <p className="text-sm font-bold text-gray-900 line-clamp-2">{task.title}</p>
                            <span className={`shrink-0 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border 
                              ${task.priority === 'high' ? 'bg-red-50 text-red-700 border-red-200' :
                                task.priority === 'medium' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                                  'bg-green-50 text-green-700 border-green-200'}`}>
                              {task.priority}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-gray-500 font-bold uppercase">
                            <span>{userRole?.toLowerCase() === 'admin' ? `Assigned to: ${task.assigneeName || 'Unknown'}` : `Due: ${task.due?.toLocaleDateString() || 'N/A'}`}</span>
                            {task.due && task.due < new Date() && <span className="text-[#ED2939]">Overdue</span>}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <button
                    onClick={() => navigate(userRole?.toLowerCase() === 'admin' ? '/admin/tasks' : '/tasks')}
                    className="mt-4 w-full py-2.5 rounded-xl bg-slate-50 text-[#ED2939] font-bold text-sm hover:bg-red-50 transition-colors border border-red-100"
                  >
                    {userRole?.toLowerCase() === 'admin' ? 'Manage Tasks →' : 'View My Tasks →'}
                  </button>
                </div>
              </div>
            </>
          )}

        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;
