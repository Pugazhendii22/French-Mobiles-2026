import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/common/Layout';
import SecondHandForm from './SecondHandForm';
import { useAuth } from '../../context/AuthContext';
import ConfirmDeleteModal from '../../components/ConfirmDeleteModal';

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
      className="w-14 h-14 rounded-full bg-[#002395] text-white flex items-center justify-center hover:bg-[#001a7a] transition-all"
      style={{ boxShadow: '0 4px 12px rgba(0, 35, 149, 0.18)' }}
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

  return (
    <Layout title="Second-Hand Inventory" pageType="list" fab={fab}>
      <div className="bg-[#f8fafc] min-h-[calc(100vh-100px)] flex-1 min-w-0">
        <div className="max-w-7xl mx-auto pb-8 flex-1 min-w-0">

          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-[#0f172a]">Second-Hand Mobiles</h1>
              <span className="bg-[#002395] text-white text-xs font-bold px-2.5 py-1 rounded-full">{mobiles.length}</span>
            </div>
          </div>

          {/* SEARCH */}
          <div className="mb-4">
            <div className="relative">
              <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-[#002395]"></i>
              <input
                id="secondhand-search"
                type="text"
                placeholder="Search by brand, model, IMEI or serial number..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-2.5 border-2 border-[#e2e8f0] focus:border-[#002395] rounded-xl bg-white focus:outline-none transition-colors text-sm font-medium text-[#0f172a]"
              />
            </div>
          </div>

          {/* DATE FILTER */}
          <div className="mb-4">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div>
                <p className="text-sm font-semibold text-[#002395]">Filter by date</p>
                <p className="text-xs text-gray-500">Filter mobiles by addition date</p>
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

          {/* FILTER PILLS */}
          <div className="flex gap-2 pb-4 overflow-x-auto scrollbar-hide">
            {['all', 'available', 'sold'].map(f => (
              <button
                key={f}
                onClick={() => setFilterStatus(f)}
                className={`flex-shrink-0 whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-medium transition ${
                  filterStatus === f
                    ? f === 'available' ? 'bg-green-600 text-white'
                    : f === 'sold'      ? 'bg-[#ED2939] text-white'
                    : 'bg-[#002395] text-white'
                    : 'bg-white border border-[#e2e8f0] text-[#64748b]'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {/* MOBILE CARDS */}
          {loading ? (
            <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="bg-white rounded-2xl h-24 animate-pulse" />)}</div>
          ) : (
            <div className="space-y-3">
              {filteredMobiles.length === 0 ? (
                <div className="text-center py-16">
                  <i className="fas fa-mobile-alt text-4xl text-gray-200 mb-3 block"></i>
                  <p className="text-gray-400 text-sm">No mobiles found</p>
                </div>
              ) : (
                filteredMobiles.map(m => (
                  <div
                    key={m.id}
                    onClick={() => navigate(`/inventory/second-hand/${m.id}`)}
                    className={`bg-white rounded-2xl border-l-4 shadow-sm p-4 cursor-pointer active:scale-95 transition ${
                      m.condition === 'A' ? 'border-green-500' :
                      m.condition === 'B' ? 'border-[#002395]' :
                      m.condition === 'C' ? 'border-orange-500' :
                      'border-[#ED2939]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-[#0f172a] text-sm">{m.brand} {m.model}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${gradeColor(m.condition)}`}>
                            Grade {m.condition}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {m.ram && <span className="bg-[#002395]/10 text-[#002395] text-xs px-2 py-0.5 rounded-full">{m.ram} RAM</span>}
                          {m.rom && <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">{m.rom} ROM</span>}
                        </div>
                        {m.imei1 && <p className="text-gray-400 text-xs mt-1">IMEI: {m.imei1}</p>}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <p className="font-bold text-[#002395] text-base">₹{m.salePrice}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          m.status === 'available' || !m.status
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}>
                          {m.status === 'available' || !m.status ? 'Available' : 'Sold'}
                        </span>
                        {(m.status === 'available' || !m.status) && (
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
                            className="bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded-lg text-xs font-semibold mt-1 transition"
                          >
                            Sell
                          </button>
                        )}
                        {userRole === 'admin' && (
                          <button
                            onClick={e => { e.stopPropagation(); handleDeleteClick(m); }}
                            title={m.status === 'sold' ? 'Cannot delete sold mobile' : 'Delete'}
                            className="text-[#ED2939] p-1"
                          >
                            <i className="fas fa-trash text-xs"></i>
                          </button>
                        )}
                        <i className="fas fa-chevron-right text-gray-300 text-xs"></i>
                      </div>
                    </div>
                  </div>
                ))
              )}
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
      </div>
    </Layout>
  );
};

export default SecondHandList;
