import React, { useState, useEffect } from 'react';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { Link, useLocation } from 'react-router-dom';
import NewSaleModal from '../../components/sales/NewSaleModal';
import Layout from '../../components/common/Layout';
import { useAuth } from '../../context/AuthContext';
import ConfirmDeleteModal from '../../components/ConfirmDeleteModal';
import { SearchBar, CollapsibleFilter, EmptyState, ListSkeleton, Chip } from '../../components/common/ui';

const SalesList = () => {
  const { userRole } = useAuth();
  const location = useLocation();
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [prefillData, setPrefillData] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (location.state) {
      setPrefillData(location.state);
      setShowModal(true);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const fetchData = async () => {
    try {
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
      className="w-14 h-14 rounded-full bg-[#002395] text-white flex items-center justify-center"
      style={{ boxShadow: '0 6px 18px rgba(0, 35, 149, 0.35)' }}
      aria-label="New Sale"
    >
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/></svg>
    </button>
  );

  const dateFilterActive = Boolean(fromDate || toDate);

  return (
    <Layout title="Sales" pageType="list" fab={fab}>
      <div className="max-w-3xl mx-auto space-y-3">

        <SearchBar
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onClear={() => setSearchQuery('')}
          placeholder="Search name, phone or invoice"
        />

        <CollapsibleFilter
          open={showFilters}
          onToggle={() => setShowFilters(prev => !prev)}
          active={dateFilterActive}
        >
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">From</label>
              <input
                type="date"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#002395]"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">To</label>
              <input
                type="date"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#002395]"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => { setFromDate(''); setToDate(''); }}
            className="w-full text-sm font-semibold text-[#ED2939] bg-[#ED2939]/10 py-2.5 rounded-xl"
          >
            Clear dates
          </button>
        </CollapsibleFilter>

        {!loading && (
          <p className="text-xs text-gray-400 px-1">
            {filteredSales.length} of {sales.length} {sales.length === 1 ? 'sale' : 'sales'}
          </p>
        )}

        {loading ? (
          <ListSkeleton count={5} />
        ) : filteredSales.length === 0 ? (
          <EmptyState icon="fa-receipt" title="No sales found" hint="Try a different search or date range" />
        ) : (
          <div className="space-y-3">
            {filteredSales.map(sale => {
              const isPaid = !(sale.balanceDue > 0);
              return (
                <Link
                  key={sale.id}
                  to={`/sales/${sale.id}`}
                  className={`bg-white rounded-2xl border-l-4 shadow-sm p-3 block ${isPaid ? 'border-green-500' : 'border-[#ED2939]'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold text-[#002395] font-mono">{sale.invoiceNumber}</p>
                      <p className="font-bold text-[#0f172a] text-sm mt-0.5 truncate">{sale.customerName}</p>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <Chip className={
                          sale.saleType === 'Second-hand' ? 'bg-[#002395]/10 text-[#002395]' :
                          sale.saleType === 'Service' ? 'bg-purple-100 text-purple-700' :
                          'bg-green-100 text-green-700'
                        }>
                          {sale.saleType || 'Sale'}
                        </Chip>
                        {sale.paymentMethod && <Chip>{sale.paymentMethod}</Chip>}
                      </div>
                      <p className="text-gray-400 text-[11px] mt-1.5">
                        {sale.createdAt?.toDate?.()?.toLocaleDateString('en-IN')}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="font-bold text-[#002395] text-base leading-tight">₹{sale.totalAmount}</p>
                      <span className={`inline-block mt-1.5 text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        isPaid ? 'bg-green-100 text-green-700' : 'bg-[#ED2939]/10 text-[#ED2939]'
                      }`}>
                        {isPaid ? 'Paid' : `Due ₹${sale.balanceDue}`}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {showModal && (
          <NewSaleModal
            isOpen={showModal}
            onClose={() => setShowModal(false)}
            onSuccess={fetchData}
            prefillData={prefillData}
          />
        )}

        <ConfirmDeleteModal
          isOpen={!!deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          deleting={deleting}
          title="Delete Sale"
          message="Are you sure you want to delete this sale? This action cannot be undone."
        />
      </div>
    </Layout>
  );
};

export default SalesList;
