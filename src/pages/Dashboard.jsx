import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase/firebase';
import { collection, getDocs, getCountFromServer, query, where } from 'firebase/firestore';
import Layout from '../components/common/Layout';
import { Section, EmptyState } from '../components/common/ui';

/* Compact tappable tile - the unit the whole stat grid is built from.
   Defined at module level so it is not recreated on every render. */
const Tile = ({ onOpen, icon, label, value, sub, tone }) => (
  <button
    onClick={onOpen}
    className="bg-white rounded-2xl p-3 shadow-sm border-l-4 text-left w-full flex flex-col justify-between min-h-[92px]"
    style={{ borderLeftColor: tone }}
  >
    <div className="flex items-center gap-2">
      <span
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${tone}1a`, color: tone }}
      >
        <i className={`fas ${icon} text-xs`}></i>
      </span>
      <span className="text-[11px] text-gray-500 font-medium leading-tight">{label}</span>
    </div>
    <div className="mt-1.5">
      <p className="text-xl font-bold leading-none" style={{ color: tone }}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-1 truncate">{sub}</p>}
    </div>
  </button>
);

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

        const isAdminRole = userRole?.toLowerCase() === 'admin';
        // Staff can only list tasks assigned to them (see MyTasks.jsx) - an
        // unfiltered query is rejected by the Firestore rules for non-admins,
        // which used to fail the whole Promise.all and leave every stat blank.
        const tasksQuery = isAdminRole
          ? collection(db, 'tasks')
          : query(collection(db, 'tasks'), where('assignedTo', '==', currentUser?.uid || '__none__'));

        // Fetch all data in parallel for better performance
        const [
          salesSnap,
          prodSnap,
          srvSnap,
          custCountSnap,
          custTodayCountSnap,
          enqSnap,
          tasksSnap
        ] = await Promise.all([
          getDocs(collection(db, 'sales')),
          getDocs(collection(db, 'products')),
          getDocs(collection(db, 'service_orders')),
          // Counted on the server - the dashboard only needs two numbers, and
          // downloading every customer to get them is a read per customer.
          getCountFromServer(collection(db, 'customers')),
          getCountFromServer(query(
            collection(db, 'customers'),
            where('createdAt', '>=', startToday.toISOString())
          )),
          getDocs(collection(db, 'enquiries')),
          getDocs(tasksQuery)
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

        // 4. Process Customers (server-side counts)
        newStats.totalCustomers = custCountSnap.data().count;
        newStats.customersToday = custTodayCountSnap.data().count;

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

  const isAdmin = userRole?.toLowerCase() === 'admin';

  return (
    <Layout title="Dashboard" pageType="dashboard">
      <div className="max-w-3xl mx-auto space-y-3">

        {/* ── GREETING ── */}
        <div>
          <h1 className="text-xl font-bold text-[#0f172a]">
            {timeOfDayGreeting}, {userName || currentUser?.email?.split('@')[0] || 'User'}
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">{formattedDate}</p>
        </div>

        {/* ── ALERTS ── */}
        {!loading && isAdmin && stats.overdueOrders > 0 && (
          <button
            onClick={() => navigate('/service')}
            className="w-full bg-[#ED2939] text-white rounded-2xl px-4 py-3 flex items-center gap-3 text-left"
          >
            <i className="fas fa-exclamation-triangle text-lg shrink-0"></i>
            <span className="flex-1 text-sm font-semibold">
              {stats.overdueOrders} service order{stats.overdueOrders > 1 ? 's are' : ' is'} overdue
            </span>
            <i className="fas fa-chevron-right text-xs opacity-70"></i>
          </button>
        )}

        {!loading && !isAdmin && tasksInfo.overdue > 0 && (
          <button
            onClick={() => navigate('/tasks')}
            className="w-full bg-orange-500 text-white rounded-2xl px-4 py-3 flex items-center gap-3 text-left"
          >
            <i className="fas fa-clock text-lg shrink-0"></i>
            <span className="flex-1 text-sm font-semibold">
              You have {tasksInfo.overdue} overdue task{tasksInfo.overdue > 1 ? 's' : ''}
            </span>
            <i className="fas fa-chevron-right text-xs opacity-70"></i>
          </button>
        )}

        {loading ? (
          <div className="space-y-3">
            <div className="bg-white rounded-2xl h-28 animate-pulse" />
            <div className="grid grid-cols-2 gap-3">
              {[...Array(4)].map((_, i) => <div key={i} className="bg-white rounded-2xl h-24 animate-pulse" />)}
            </div>
          </div>
        ) : (
          <>
            {/* ── TODAY'S SALES ── */}
            <button
              onClick={() => navigate('/sales')}
              className="w-full bg-[#002395] rounded-2xl p-4 text-left relative overflow-hidden"
            >
              <i className="fas fa-indian-rupee-sign absolute -right-2 top-1/2 -translate-y-1/2 text-7xl text-white opacity-10"></i>
              <p className="text-white/80 text-xs font-medium uppercase tracking-wide">Today's Sales</p>
              <p className="text-white text-3xl font-bold mt-1">₹{stats.salesTodayAmt.toLocaleString()}</p>
              <p className="text-white/70 text-xs mt-0.5">
                {stats.salesTodayCount} transaction{stats.salesTodayCount !== 1 ? 's' : ''} today
              </p>
            </button>

            {/* ── QUICK ACTIONS ── */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => navigate('/service')}
                className="bg-[#002395] text-white rounded-2xl py-3.5 text-sm font-bold flex flex-col items-center gap-1.5"
              >
                <i className="fas fa-plus text-lg"></i>Service Order
              </button>
              <button
                onClick={() => navigate('/inventory/second-hand')}
                className="bg-white border border-[#002395]/25 text-[#002395] rounded-2xl py-3.5 text-sm font-bold flex flex-col items-center gap-1.5"
              >
                <i className="fas fa-mobile-alt text-lg"></i>Add Mobile
              </button>
              <button
                onClick={() => navigate('/sales')}
                className="bg-white border border-[#ED2939]/25 text-[#ED2939] rounded-2xl py-3.5 text-sm font-bold flex flex-col items-center gap-1.5"
              >
                <i className="fas fa-receipt text-lg"></i>New Sale
              </button>
              <button
                onClick={() => navigate('/scanner')}
                className="bg-white border border-gray-200 text-gray-600 rounded-2xl py-3.5 text-sm font-bold flex flex-col items-center gap-1.5"
              >
                <i className="fas fa-qrcode text-lg"></i>Scan Label
              </button>
            </div>

            {/* ── STATS ── */}
            <div className="grid grid-cols-2 gap-3">
              <Tile onOpen={() => navigate('/service')} icon="fa-tools" label="Pending Orders"
                    value={stats.pendingOrders} sub="Awaiting completion" tone="#002395" />
              <Tile onOpen={() => navigate('/service')} icon="fa-exclamation-circle" label="Overdue"
                    value={stats.overdueOrders} sub="Past deadline" tone="#ED2939" />
              <Tile onOpen={() => navigate('/service')} icon="fa-clock" label="Due Today"
                    value={stats.dueTodayOrders} sub="Service orders" tone="#f97316" />
              <Tile onOpen={() => navigate('/products')} icon="fa-box" label="Low Stock"
                    value={stats.lowStockCount} sub="Need restock" tone="#eab308" />
              {isAdmin ? (
                <Tile onOpen={() => navigate('/due-payments')} icon="fa-rupee-sign" label="Due Payments"
                      value={`₹${stats.pendingBillsAmt.toLocaleString()}`} sub="From customers" tone="#ED2939" />
              ) : (
                <Tile onOpen={() => navigate('/sales')} icon="fa-file-invoice" label="Pending Bills"
                      value={`₹${stats.pendingBillsAmt.toLocaleString()}`} sub="Balance due" tone="#a855f7" />
              )}
              <Tile onOpen={() => navigate('/enquiries')} icon="fa-question-circle" label="Open Enquiries"
                    value={stats.openEnquiries} tone="#ED2939" />
              <Tile onOpen={() => navigate('/customers')} icon="fa-users" label="Customers"
                    value={stats.totalCustomers} tone="#002395" />
              <Tile onOpen={() => navigate('/customers')} icon="fa-user-plus" label="New Today"
                    value={stats.customersToday} sub="Customers added" tone="#22c55e" />
            </div>

            {/* ── RECENT ORDERS ── */}
            <Section
              icon="fa-tools"
              title="Recent Service Orders"
              action={
                <button onClick={() => navigate('/service')} className="text-xs font-bold text-[#002395] shrink-0">
                  View all
                </button>
              }
            >
              {recentOrders.length === 0 ? (
                <EmptyState icon="fa-tools" title="No recent service orders" />
              ) : (
                <div className="space-y-2">
                  {recentOrders.map(order => (
                    <button
                      key={order.id}
                      onClick={() => navigate(`/service/${order.id}`)}
                      className="w-full flex items-center justify-between gap-3 bg-gray-50 rounded-xl p-3 text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-bold text-[#002395] uppercase tracking-wider">{order.orderNumber}</p>
                        <p className="text-sm font-semibold text-[#0f172a] truncate">{order.customerName}</p>
                        <p className="text-[11px] text-gray-400 truncate">{order.brand} {order.model}</p>
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-1">
                        <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border ${getStatusColor(order.status)}`}>
                          {order.status}
                        </span>
                        <span className="text-[10px] text-gray-400 font-semibold">{getTimeAgo(order.createdAt)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </Section>

            {/* ── TASKS ── */}
            <Section
              icon="fa-list-check"
              title={isAdmin ? 'Tasks Summary' : 'My Tasks'}
              tone="danger"
              action={
                <button
                  onClick={() => navigate(isAdmin ? '/admin/tasks' : '/tasks')}
                  className="text-xs font-bold text-[#ED2939] shrink-0"
                >
                  {isAdmin ? 'Manage' : 'View all'}
                </button>
              }
            >
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-gray-500 uppercase font-bold">Pending</p>
                  <p className="text-2xl font-bold text-[#0f172a]">{tasksInfo.totalPending}</p>
                </div>
                <div className="bg-red-50 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-[#ED2939] uppercase font-bold">Overdue</p>
                  <p className="text-2xl font-bold text-[#ED2939]">{tasksInfo.overdue}</p>
                </div>
              </div>

              {tasksInfo.list.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-3">No urgent tasks</p>
              ) : (
                <div className="space-y-2">
                  {tasksInfo.list.map(task => (
                    <div key={task.id} className="bg-gray-50 rounded-xl p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-[#0f172a] flex-1">{task.title}</p>
                        <span className={`shrink-0 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border
                          ${task.priority === 'high' ? 'bg-red-50 text-red-700 border-red-200' :
                            task.priority === 'medium' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                              'bg-green-50 text-green-700 border-green-200'}`}>
                          {task.priority}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-gray-400 font-semibold uppercase mt-1.5">
                        <span className="truncate">
                          {isAdmin ? `To: ${task.assigneeName || 'Unknown'}` : `Due: ${task.due?.toLocaleDateString() || 'N/A'}`}
                        </span>
                        {task.due && task.due < new Date() && <span className="text-[#ED2939] shrink-0 ml-2">Overdue</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </>
        )}

      </div>
    </Layout>
  );
};

export default Dashboard;
