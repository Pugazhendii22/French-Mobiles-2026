import React, { useState, useEffect } from 'react';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { Link, useLocation } from 'react-router-dom';
import NewSaleModal from '../../components/sales/NewSaleModal';
import Layout from '../../components/common/Layout';
import { useAuth } from '../../context/AuthContext';
import ConfirmDeleteModal from '../../components/ConfirmDeleteModal';

const SalesList = () => {
  const { userRole } = useAuth();
  const location = useLocation();
  const [sales, setSales] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [prefillData, setPrefillData] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (location.state) {
      setPrefillData(location.state);
      setShowModal(true);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const fetchData = async () => {
    try {
      const custSnap = await getDocs(collection(db, 'customers'));
      const cList = [];
      custSnap.forEach(doc => cList.push(doc.data()));
      setCustomers(cList);

      const snap = await getDocs(collection(db, 'sales'));
      const list = [];
      snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setSales(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'sales', deleteTarget.id));
      setSales(prev => prev.filter(s => s.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) { console.error(err); }
    finally { setDeleting(false); }
  };

  const filteredSales = sales.filter(s => {
    const q = searchQuery.replace(/\s+/g, '').toLowerCase();
    const matchesSearch = !searchQuery || 
      (s.customerName?.replace(/\s+/g, '').toLowerCase() || '').includes(q) ||
      (s.customerPhone?.replace(/\s+/g, '').toLowerCase() || '').includes(q) ||
      (s.invoiceNumber?.replace(/\s+/g, '').toLowerCase() || '').includes(q);
    
    const sDate = s.date;
    const matchesFrom = !fromDate || sDate >= fromDate;
    const matchesTo = !toDate || sDate <= toDate;

    return matchesSearch && matchesFrom && matchesTo;
  });

  useEffect(() => {
    if (showModal || deleteTarget) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => { document.body.style.overflow = "unset"; };
  }, [showModal, deleteTarget]);

  const fab = (
    <button
      onClick={() => setShowModal(true)}
      className="w-14 h-14 rounded-full bg-[#002395] text-white flex items-center justify-center hover:bg-[#001a7a] transition-all"
      style={{ boxShadow: '0 4px 12px rgba(0, 35, 149, 0.18)' }}
      aria-label="New Sale"
    >
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/></svg>
    </button>
  );

return (
  <Layout title="Sales" pageType="list" fab={fab}>
    <div className="min-h-screen bg-[#f8fafc]">

      {/* HEADER */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-[#0f172a]">Sales</h1>
        <span className="bg-[#002395] text-white text-xs font-bold px-2.5 py-1 rounded-full">
          {sales.length}
        </span>
      </div>
      <button
        onClick={() => setShowModal(true)}
        className="hidden md:flex items-center gap-2 bg-[#002395] text-white px-4 py-2 rounded-xl text-sm font-semibold"
      >
        <i className="fas fa-plus"></i> New Sale
      </button>
    </div>

    {/* DATE FILTER */}
    <div className="px-4 pt-3 pb-2">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div>
          <p className="text-sm font-semibold text-[#002395]">Select dates</p>
          <p className="text-xs text-gray-500">Filter sales by start and end date</p>
        </div>
        <button
          type="button"
          onClick={() => { setFromDate(''); setToDate(''); }}
          className="text-sm font-semibold text-[#ED2939] bg-[#ED2939]/10 px-3 py-2 rounded-xl hover:bg-[#ED2939]/15 transition"
        >
          Clear
        </button>
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input
            type="date"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#002395]"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input
            type="date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#002395]"
          />
        </div>
      </div>
    </div>

    {/* SEARCH */}
    <div className="px-4 pb-3">
      <div className="relative">
        <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
        <input
          type="text"
          placeholder="Search by name, phone, invoice..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-[#002395] shadow-sm"
        />
      </div>
    </div>

    {/* SALES CARDS */}
    <div className="px-4 space-y-3">
      {filteredSales.length === 0 ? (
        <div className="text-center py-16">
          <i className="fas fa-receipt text-4xl text-gray-200 mb-3 block"></i>
          <p className="text-gray-400 text-sm">No sales found</p>
        </div>
      ) : (
        filteredSales.map(sale => (
          <Link
            key={sale.id}
            to={`/sales/${sale.id}`}
            className="bg-white rounded-2xl border-l-4 border-[#002395] shadow-sm p-4 cursor-pointer active:scale-95 transition block"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs font-bold text-[#002395] font-mono">{sale.invoiceNumber}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    sale.saleType === 'Second-hand' ? 'bg-[#002395]/10 text-[#002395]' :
                    sale.saleType === 'Service' ? 'bg-purple-100 text-purple-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    {sale.saleType || 'Sale'}
                  </span>
                </div>
                <p className="font-semibold text-[#0f172a] text-sm mt-1">{sale.customerName}</p>
                <p className="text-gray-400 text-xs mt-0.5">
                  {sale.createdAt?.toDate?.()?.toLocaleDateString('en-IN')}
                  {sale.paymentMethod && ` · ${sale.paymentMethod}`}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <p className="font-bold text-[#002395] text-base">₹{sale.totalAmount}</p>
                {sale.balanceDue > 0 ? (
                  <span className="text-xs bg-[#ED2939]/10 text-[#ED2939] px-2 py-0.5 rounded-full font-medium">
                    Due ₹{sale.balanceDue}
                  </span>
                ) : (
                  <span className="text-xs text-green-600">
                    <i className="fas fa-check-circle mr-1"></i>Paid
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))
      )}
    </div>

    {/* NEW SALE MODAL */}
    {showModal && (
      <NewSaleModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={fetchData}
        prefillData={prefillData}
      />
    )}

  </div>
  </Layout>
);
};

export default SalesList;
