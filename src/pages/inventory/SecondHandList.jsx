import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/common/Layout';
import SecondHandForm from './SecondHandForm';
import { useAuth } from '../../context/AuthContext';
import ConfirmDeleteModal from '../../components/ConfirmDeleteModal';
import { imageThumb } from '../../utils/imageUrl';

const SecondHandList = () => {
  const { userRole } = useAuth();
  const navigate = useNavigate();
  const [mobiles, setMobiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const fetchMobiles = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'second_hand_mobiles'));
      const list = [];
      snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setMobiles(list);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { fetchMobiles(); }, []);

  const handleSaveMobile = async (data) => {
    const newMobile = { ...data, updatedAt: new Date().toISOString() };
    if (data.id) {
      const { id, ...updateData } = newMobile;
      await updateDoc(doc(db, 'second_hand_mobiles', id), updateData);
      fetchMobiles();
      return id;
    }
    newMobile.createdAt = new Date().toISOString();
    const docRef = await addDoc(collection(db, 'second_hand_mobiles'), newMobile);
    fetchMobiles();
    return docRef.id;
  };

  const handleDeleteClick = (m) => {
    if (m.status === 'sold') {
      alert('Cannot delete a sold mobile.');
      return;
    }
    setDeleteTarget(m);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'second_hand_mobiles', deleteTarget.id));
      setMobiles(prev => prev.filter(m => m.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) { console.error(err); }
    finally { setDeleting(false); }
  };

  const filteredMobiles = useMemo(() => {
    return mobiles.filter(m => {
      if (filterStatus !== 'all' && (m.status || 'available') !== filterStatus) return false;
      
      const q = searchQuery.replace(/\s+/g, '').toLowerCase();
      const matchesSearch = !searchQuery || 
        [m.brand, m.model, m.imei1, m.imei2, m.serialNumber].some(v => 
          v?.replace(/\s+/g, '').toLowerCase().includes(q)
        );
      
      // Date filtering
      const mobileDate = m.createdAt ? new Date(m.createdAt) : null;
      const matchesFrom = !fromDate || (mobileDate && mobileDate >= new Date(fromDate));
      const matchesTo = !toDate || (mobileDate && mobileDate <= new Date(toDate + 'T23:59:59'));
      
      return matchesSearch && matchesFrom && matchesTo;
    });
  }, [mobiles, filterStatus, searchQuery, fromDate, toDate]);

  const gradeColor = (g) => ({ 
    A: 'bg-green-100 text-green-700', 
    B: 'bg-blue-100 text-blue-700', 
    C: 'bg-orange-100 text-orange-700', 
    D: 'bg-red-100 text-red-700' 
  }[g] || 'bg-gray-100 text-[#64748b]');

  const fab = (
    <button
      onClick={() => setShowModal(true)}
      className="w-14 h-14 rounded-full bg-[#002395] text-white flex items-center justify-center"
      style={{ boxShadow: '0 6px 18px rgba(0, 35, 149, 0.35)' }}
      aria-label="Add Mobile"
    >
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/></svg>
    </button>
  );

  useEffect(() => {
    if (showModal || deleteTarget) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => { document.body.style.overflow = "unset"; };
  }, [showModal, deleteTarget]);

  const dateFilterActive = Boolean(fromDate || toDate);

  return (
    <Layout title="Second-Hand Inventory" pageType="list" fab={fab}>
      <div className="max-w-3xl mx-auto space-y-3">

        {/* ── SEARCH ── */}
        <div className="relative">
          <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
          <input
            id="secondhand-search"
            type="text"
            placeholder="Search brand, model, IMEI or serial"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-10 py-3 border border-[#e2e8f0] focus:border-[#002395] rounded-2xl bg-white focus:outline-none transition-colors text-sm text-[#0f172a] shadow-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center"
              aria-label="Clear search"
            >
              <i className="fas fa-times text-xs"></i>
            </button>
          )}
        </div>

        {/* ── STATUS SEGMENTED CONTROL ── */}
        <div className="flex bg-white rounded-2xl p-1 shadow-sm border border-[#e2e8f0]">
          {['all', 'available', 'sold'].map(f => (
            <button
              key={f}
              onClick={() => setFilterStatus(f)}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold transition ${
                filterStatus === f
                  ? f === 'available' ? 'bg-green-600 text-white'
                  : f === 'sold'      ? 'bg-[#ED2939] text-white'
                  : 'bg-[#002395] text-white'
                  : 'text-[#64748b]'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* ── DATE FILTER (collapsed by default so stock is visible sooner) ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-[#e2e8f0] overflow-hidden">
          <button
            onClick={() => setShowFilters(prev => !prev)}
            className="w-full flex items-center justify-between px-4 py-3"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-[#0f172a]">
              <i className="fas fa-calendar-alt text-[#002395] text-xs"></i>
              Filter by date
              {dateFilterActive && (
                <span className="bg-[#002395] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">On</span>
              )}
            </span>
            <i className={`fas fa-chevron-down text-gray-300 text-xs transition-transform ${showFilters ? 'rotate-180' : ''}`}></i>
          </button>
          {showFilters && (
            <div className="px-4 pb-4 space-y-3 border-t border-gray-50 pt-3">
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
            </div>
          )}
        </div>

        {/* ── RESULT COUNT ── */}
        {!loading && (
          <p className="text-xs text-gray-400 px-1">
            {filteredMobiles.length} of {mobiles.length} {mobiles.length === 1 ? 'mobile' : 'mobiles'}
          </p>
        )}

        {/* ── LIST ── */}
        {loading ? (
          <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="bg-white rounded-2xl h-28 animate-pulse" />)}</div>
        ) : filteredMobiles.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-[#e2e8f0]">
            <i className="fas fa-mobile-alt text-4xl text-gray-200 mb-3 block"></i>
            <p className="text-gray-500 font-semibold text-sm">No mobiles found</p>
            <p className="text-gray-400 text-xs mt-1">Try a different search or filter</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredMobiles.map(m => {
              const isAvailable = m.status === 'available' || !m.status;
              return (
                <div
                  key={m.id}
                  onClick={() => navigate(`/inventory/second-hand/${m.id}`)}
                  className={`bg-white rounded-2xl border-l-4 shadow-sm overflow-hidden cursor-pointer ${
                    m.condition === 'A' ? 'border-green-500' :
                    m.condition === 'B' ? 'border-[#002395]' :
                    m.condition === 'C' ? 'border-orange-500' :
                    'border-[#ED2939]'
                  }`}
                >
                  <div className="p-3 flex gap-3">
                    {/* Thumbnail makes the list scannable at a glance */}
                    <div className="w-16 h-16 rounded-xl bg-gray-50 border border-gray-100 shrink-0 overflow-hidden flex items-center justify-center">
                      {m.photo1Url ? (
                        <img src={imageThumb(m.photo1Url, 64)} alt={`${m.brand} ${m.model}`} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                      ) : (
                        <i className="fas fa-mobile-alt text-gray-300 text-xl"></i>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-bold text-[#0f172a] text-sm leading-tight truncate">
                          {m.brand} {m.model}
                        </p>
                        <p className="font-bold text-[#002395] text-base shrink-0 leading-tight">₹{m.salePrice}</p>
                      </div>

                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${gradeColor(m.condition)}`}>
                          Grade {m.condition}
                        </span>
                        {m.ram && <span className="bg-[#002395]/10 text-[#002395] text-[10px] px-2 py-0.5 rounded-full font-medium">{m.ram}</span>}
                        {m.rom && <span className="bg-gray-100 text-gray-600 text-[10px] px-2 py-0.5 rounded-full font-medium">{m.rom}</span>}
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                          isAvailable ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {isAvailable ? 'Available' : 'Sold'}
                        </span>
                      </div>

                      {m.imei1 && <p className="text-gray-400 text-[11px] mt-1.5 truncate">IMEI {m.imei1}</p>}
                    </div>
                  </div>

                  {/* Actions on their own row - full-size targets, no mis-taps */}
                  {(isAvailable || userRole === 'admin') && (
                    <div className="flex items-center gap-2 px-3 pb-3">
                      {isAvailable && (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            navigate('/sales', {
                              state: {
                                items: [
                                  {
                                    type: 'Second-hand',
                                    itemId: m.id,
                                    name: `${m.brand} ${m.model}`,
                                    quantity: 1,
                                    unitPrice: Number(m.salePrice || 0),
                                    purchaseCost: Number(m.purchasePrice || 0),
                                    repairCost: Number(m.repairCost || 0),
                                    imei: m.imei1 || ''
                                  }
                                ]
                              }
                            });
                          }}
                          className="flex-1 bg-green-600 text-white py-2.5 rounded-xl text-xs font-bold"
                        >
                          <i className="fas fa-cart-plus mr-1.5"></i>Sell
                        </button>
                      )}
                      {userRole === 'admin' && (
                        <button
                          onClick={e => { e.stopPropagation(); handleDeleteClick(m); }}
                          title={m.status === 'sold' ? 'Cannot delete sold mobile' : 'Delete'}
                          className="w-11 h-10 rounded-xl bg-[#ED2939]/10 text-[#ED2939] flex items-center justify-center shrink-0"
                          aria-label="Delete mobile"
                        >
                          <i className="fas fa-trash text-xs"></i>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {showModal && (
          <SecondHandForm onSave={handleSaveMobile} onCancel={() => setShowModal(false)} />
        )}
        <ConfirmDeleteModal
          isOpen={!!deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          deleting={deleting}
          title="Delete Mobile"
          message="Are you sure you want to delete this mobile? This action cannot be undone."
        />
      </div>
    </Layout>
  );
};

export default SecondHandList;
