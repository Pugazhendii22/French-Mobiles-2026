import React, { useState, useEffect } from 'react';
import { money } from '@/shared/ui/uiTokens';
import { deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/shared/firebase/firebase';
import { Link, useLocation } from 'react-router-dom';
import NewSaleModal from '../../components/sales/NewSaleModal';
import Layout from '@/shared/ui/Layout';
import { useAuth } from '../../context/AuthContext';
import { loadCollection, invalidateCollection } from '@/shared/data/collectionCache';
import ConfirmDeleteModal from '@/shared/ui/ConfirmDeleteModal';
import { SearchBar, CollapsibleFilter, EmptyState, ListSkeleton } from '@/shared/ui/ui';

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
      const list = await loadCollection('sales');
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
      invalidateCollection('sales');
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
          <p className="text-xs text-[#64748b] px-1">
            {filteredSales.length} of {sales.length} {sales.length === 1 ? 'sale' : 'sales'}
          </p>
        )}

        {loading ? (
          <ListSkeleton count={5} />
        ) : filteredSales.length === 0 ? (
          <EmptyState icon="fa-receipt" title="No sales found" hint="Try a different search or date range" />
        ) : (
          /* One sheet, hairline-separated, exactly as the stock list and the
             service list are drawn. These were separate rounded cards floating on
             the background, which fitted four to a phone screen where the other
             two lists fit seven - and read as a different screen in the same app.

             The spine down the left answers the one question a bill is scanned
             for: is there still money on it. Green is settled, red is not. */
          <div className="bg-white border border-[#E6EAF0] rounded-xl overflow-hidden">
            {filteredSales.map(sale => {
              const isPaid = !(sale.balanceDue > 0);
              return (
                <Link
                  key={sale.id}
                  to={`/sales/${sale.id}`}
                  className="relative flex gap-3 pl-4 pr-3 py-2.5 border-b border-[#F1F4F9] last:border-0 block active:bg-[#F8FAFC] focus:outline-none focus:bg-[#F1F4F9]"
                >
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-0 bottom-0 w-[3px]"
                    style={{ background: isPaid ? '#16a34a' : '#ED2939' }}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[11px] font-bold text-[#002395] font-mono shrink-0">
                          {sale.invoiceNumber}
                        </span>
                        {!isPaid && (
                          <span className="text-[10px] font-bold text-[#ED2939] shrink-0">
                            {money(sale.balanceDue)} owed
                          </span>
                        )}
                      </div>
                      <span className="text-[15px] font-bold text-[#0F172A] tabular-nums shrink-0">
                        {money(sale.totalAmount)}
                      </span>
                    </div>

                    <p className="text-[15px] font-semibold leading-tight truncate mt-0.5 text-[#0F172A]">
                      {sale.customerName}
                    </p>

                    <p className="text-[12px] text-[#64748B] leading-tight mt-0.5 truncate">
                      {[sale.saleType || 'Sale', sale.paymentMethod,
                        sale.createdAt?.toDate?.()?.toLocaleDateString('en-IN')]
                        .filter(Boolean).join(' · ')}
                    </p>
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
