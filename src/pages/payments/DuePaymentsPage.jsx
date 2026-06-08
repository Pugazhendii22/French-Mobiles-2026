import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, where } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/common/Layout';

const DuePaymentsPage = () => {
  const navigate = useNavigate();
  const [dueSales, setDueSales] = useState([]);
  const [dueServices, setDueServices] = useState([]);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('All');
  const [loading, setLoading] = useState(true);

  const fetchDuePayments = async () => {
    try {
      setLoading(true);

      // Fetch sales with balance due
      const salesSnap = await getDocs(
        query(collection(db, 'sales'), orderBy('createdAt', 'desc'))
      );
      const salesList = [];
      salesSnap.forEach(doc => {
        const data = doc.data();
        if (Number(data.balanceDue) > 0) {
          salesList.push({ id: doc.id, ...data });
        }
      });
      setDueSales(salesList);

      // Fetch completed service orders without bill
      const serviceSnap = await getDocs(
        query(
          collection(db, 'service_orders'),
          where('status', '==', 'Completed'),
          orderBy('createdAt', 'desc')
        )
      );
      const serviceList = [];
      serviceSnap.forEach(doc => {
        const data = doc.data();
        if (!data.billCreated) {
          serviceList.push({ id: doc.id, ...data });
        }
      });
      setDueServices(serviceList);

    } catch (error) {
      console.error('Error fetching due payments:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDuePayments();
  }, []);

  const filteredDueSales = dueSales.filter(s =>
    s.customerName?.toLowerCase().includes(search.toLowerCase()) ||
    s.customerPhone?.includes(search) ||
    s.invoiceNumber?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredDueServices = dueServices.filter(o =>
    o.customerName?.toLowerCase().includes(search.toLowerCase()) ||
    o.customerPhone?.includes(search) ||
    o.orderNumber?.toLowerCase().includes(search.toLowerCase())
  );

  const totalDueAmount = dueSales.reduce((sum, s) => sum + (Number(s.balanceDue) || 0), 0);

  if (loading) {
    return (
      <Layout title="Due Payments" pageType="list">
        <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
          <div className="text-center">
            <i className="fas fa-spinner text-3xl text-[#002395] animate-spin mb-4 block"></i>
            <p className="text-gray-500">Loading payments...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Due Payments" pageType="list">
      <div className="min-h-screen bg-[#f8fafc] pb-24">

        {/* HEADER */}
        <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-30 shadow-sm">
          <button onClick={() => navigate(-1)} className="text-[#002395] p-1">
            <i className="fas fa-arrow-left text-lg"></i>
          </button>
          <h1 className="text-lg font-bold text-[#0f172a] flex-1">Due Payments</h1>
          <span className="bg-[#ED2939] text-white text-xs font-bold px-2.5 py-1 rounded-full">
            {dueSales.length + dueServices.length}
          </span>
        </div>

        {/* SUMMARY CARDS */}
        <div className="px-4 pt-4 grid grid-cols-2 gap-3 mb-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 text-center">
            <p className="text-xs text-gray-400 mb-1">Total Due Amount</p>
            <p className="text-xl font-bold text-[#ED2939]">
              ₹{totalDueAmount}
            </p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 text-center">
            <p className="text-xs text-gray-400 mb-1">Pending Bills</p>
            <p className="text-xl font-bold text-[#002395]">{dueSales.length}</p>
          </div>
        </div>

        {/* SEARCH */}
        <div className="px-4 pb-3">
          <div className="relative">
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
            <input
              type="text"
              placeholder="Search by name or phone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-[#002395] shadow-sm"
            />
          </div>
        </div>

        {/* FILTER TABS */}
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-hide">
          {['All', 'Sales Due', 'Service Unpaid'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-shrink-0 whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-medium transition ${
                activeTab === tab
                  ? 'bg-[#ED2939] text-white'
                  : 'bg-white border border-gray-200 text-gray-500'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* DUE SALES SECTION */}
        {(activeTab === 'All' || activeTab === 'Sales Due') && (
          <div className="px-4 space-y-3 mb-4">
            {activeTab === 'All' && (
              <p className="text-xs font-bold text-[#ED2939] uppercase tracking-wide border-l-4 border-[#ED2939] pl-3">
                Sales with Balance Due
              </p>
            )}
            {filteredDueSales.length === 0 ? (
              <div className="text-center py-8">
                <i className="fas fa-check-circle text-3xl text-green-300 mb-2 block"></i>
                <p className="text-gray-400 text-sm">No pending sales payments</p>
              </div>
            ) : (
              filteredDueSales.map(sale => (
                <div
                  key={sale.id}
                  className="bg-white rounded-2xl border-l-4 border-[#ED2939] shadow-sm p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-[#0f172a] text-sm">{sale.customerName}</p>
                        <span className="text-xs font-mono text-[#002395]">{sale.invoiceNumber}</span>
                      </div>
                      {sale.customerPhone && (
                        <a href={`tel:${sale.customerPhone}`} className="text-green-600 text-xs mt-0.5 flex items-center">
                          <i className="fas fa-phone mr-1"></i>
                          {sale.customerPhone}
                        </a>
                      )}
                      <p className="text-xs text-gray-400 mt-0.5">
                        {sale.createdAt?.toDate?.()?.toLocaleDateString('en-IN')}
                      </p>
                      <div className="flex items-center gap-3 mt-2">
                        <div>
                          <p className="text-xs text-gray-400">Total</p>
                          <p className="text-sm font-semibold text-[#0f172a]">₹{sale.totalAmount}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">Paid</p>
                          <p className="text-sm font-semibold text-green-600">₹{sale.amountPaid}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">Balance</p>
                          <p className="text-sm font-bold text-[#ED2939]">₹{sale.balanceDue}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => navigate(`/sales/${sale.id}`)}
                        className="bg-[#002395]/10 text-[#002395] px-3 py-1.5 rounded-xl text-xs font-semibold"
                      >
                        <i className="fas fa-eye mr-1"></i>View
                      </button>
                      {sale.customerPhone && (
                        <a
                          href={`https://wa.me/91${sale.customerPhone}?text=${encodeURIComponent(
                            `Hi ${sale.customerName}, this is a reminder that you have a pending payment of Rs.${sale.balanceDue} for your purchase (Invoice: ${sale.invoiceNumber}) at French Mobiles. Please complete the payment at your earliest convenience. Thank you! - French Mobiles`
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                          className="bg-green-50 text-green-700 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1"
                        >
                          <i className="fab fa-whatsapp"></i>Remind
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* SERVICE UNPAID SECTION */}
        {(activeTab === 'All' || activeTab === 'Service Unpaid') && (
          <div className="px-4 space-y-3">
            {activeTab === 'All' && (
              <p className="text-xs font-bold text-[#002395] uppercase tracking-wide border-l-4 border-[#002395] pl-3">
                Completed Services - Bill Pending
              </p>
            )}
            {filteredDueServices.length === 0 ? (
              <div className="text-center py-8">
                <i className="fas fa-check-circle text-3xl text-green-300 mb-2 block"></i>
                <p className="text-gray-400 text-sm">No pending service bills</p>
              </div>
            ) : (
              filteredDueServices.map(order => (
                <div
                  key={order.id}
                  className="bg-white rounded-2xl border-l-4 border-[#002395] shadow-sm p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-[#0f172a] text-sm">{order.customerName}</p>
                        <span className="text-xs font-mono text-[#ED2939]">{order.orderNumber}</span>
                      </div>
                      {order.customerPhone && (
                        <a href={`tel:${order.customerPhone}`} className="text-green-600 text-xs mt-0.5 flex items-center">
                          <i className="fas fa-phone mr-1"></i>
                          {order.customerPhone}
                        </a>
                      )}
                      <p className="text-sm text-gray-500 mt-0.5">
                        {order.brand} {order.model}
                      </p>
                      <div className="flex items-center gap-3 mt-2">
                        <div>
                          <p className="text-xs text-gray-400">Service Amount</p>
                          <p className="text-sm font-bold text-[#002395]">₹{order.estimatedPrice}</p>
                        </div>
                        {order.advancePaid > 0 && (
                          <div>
                            <p className="text-xs text-gray-400">Advance</p>
                            <p className="text-sm font-semibold text-green-600">₹{order.advancePaid}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-xs text-gray-400">Balance</p>
                          <p className="text-sm font-bold text-[#ED2939]">
                            ₹{(order.estimatedPrice || 0) - (order.advancePaid || 0)}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => navigate(`/service/${order.id}`)}
                        className="bg-[#002395]/10 text-[#002395] px-3 py-1.5 rounded-xl text-xs font-semibold"
                      >
                        <i className="fas fa-eye mr-1"></i>View
                      </button>
                      {order.customerPhone && (
                        <a
                          href={`https://wa.me/91${order.customerPhone}?text=${encodeURIComponent(
                            `Hi ${order.customerName}, this is a reminder that your ${order.brand} ${order.model} service (Order: ${order.orderNumber}) is completed at French Mobiles.\n\nService Amount: Rs.${order.estimatedPrice}\nAdvance Paid: Rs.${order.advancePaid || 0}\nBalance Due: Rs.${(order.estimatedPrice || 0) - (order.advancePaid || 0)}\n\nPlease visit us to collect your device and complete the payment. Thank you! - French Mobiles`
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                          className="bg-green-50 text-green-700 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1"
                        >
                          <i className="fab fa-whatsapp"></i>Remind
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

      </div>
    </Layout>
  );
};

export default DuePaymentsPage;
