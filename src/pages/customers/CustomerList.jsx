import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../../components/common/Layout';
import CustomerForm from './CustomerForm';
import { useAuth } from '../../context/AuthContext';
import ConfirmDeleteModal from '../../components/ConfirmDeleteModal';

const Modal = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto flex items-start justify-center p-4">
    <div className="fixed inset-0" onClick={onClose} />
    <div className="relative bg-white rounded-2xl w-full max-w-2xl mx-auto my-8 shadow-2xl">
      <div className="flex items-center justify-between px-6 py-4 bg-[#002395] rounded-t-2xl">
        <h3 className="text-lg font-bold text-white">{title}</h3>
        <button onClick={onClose} className="text-white hover:text-blue-200 p-1 rounded">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
      <div className="overflow-visible flex-1 px-6 py-6">{children}</div>
    </div>
  </div>
);

const CustomerList = () => {
  const navigate = useNavigate();
  const { userRole } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all' or 'regular'
  const [showModal, setShowModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchCustomers = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'customers'));
      const list = [];
      snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setCustomers(list);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { fetchCustomers(); }, []);

  const handleSaveCustomer = async (data) => {
    await addDoc(collection(db, 'customers'), { ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    setShowModal(false);
    fetchCustomers();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'customers', deleteTarget.id));
      setCustomers(prev => prev.filter(c => c.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) { console.error(err); }
    finally { setDeleting(false); }
  };

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      if (filterType === 'regular' && !c.isRegular) return false;
      if (!searchQuery) return true;
      const q = searchQuery.replace(/\s+/g, '').toLowerCase();
      return [c.name, c.phone].some(v => v?.replace(/\s+/g, '').toLowerCase().includes(q));
    });
  }, [customers, filterType, searchQuery]);

  const fab = (
    <button
      onClick={() => setShowModal(true)}
      className="w-14 h-14 rounded-full bg-[#002395] text-white flex items-center justify-center hover:bg-[#001a7a] transition-all"
      style={{ boxShadow: '0 4px 12px rgba(0, 35, 149, 0.18)' }}
      aria-label="Add Customer"
    >
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
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
  <Layout title="Customers" pageType="list" fab={fab}>
    <div className="min-h-screen bg-[#f8fafc]">
      
      {/* HEADER */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-[#0f172a]">Customers</h1>
        <span className="bg-[#002395] text-white text-xs font-bold px-2.5 py-1 rounded-full">
          {customers.length}
        </span>
      </div>
      <button
        onClick={() => setShowModal(true)}
        className="hidden md:flex items-center gap-2 bg-[#002395] text-white px-4 py-2 rounded-xl text-sm font-semibold"
      >
        <i className="fas fa-plus"></i> Add Customer
      </button>
    </div>

    {/* SEARCH */}
    <div className="px-4 pt-4 pb-2">
      <div className="relative">
        <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
        <input
          type="text"
          placeholder="Search by name or phone..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-[#002395] shadow-sm"
        />
      </div>
    </div>

    {/* FILTER PILLS */}
    <div className="flex gap-2 px-4 pb-3">
      <button
        onClick={() => setFilterType('all')}
        className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
          filterType === 'all' 
            ? 'bg-[#002395] text-white' 
            : 'bg-white border border-gray-200 text-gray-500'
        }`}
      >
        All
      </button>
      <button
        onClick={() => setFilterType('regular')}
        className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
          filterType === 'regular' 
            ? 'bg-[#ED2939] text-white' 
            : 'bg-white border border-gray-200 text-gray-500'
        }`}
      >
        Regular
      </button>
    </div>

    {/* CUSTOMER CARDS */}
    <div className="px-4 space-y-3">
      {filteredCustomers.length === 0 ? (
        <div className="text-center py-16">
          <i className="fas fa-users text-4xl text-gray-200 mb-3 block"></i>
          <p className="text-gray-400 text-sm">No customers found</p>
        </div>
      ) : (
        filteredCustomers.map(customer => (
          <div
            key={customer.id}
            onClick={() => navigate(`/customers/${customer.id}`)}
            className={`bg-white rounded-2xl border-l-4 shadow-sm p-4 cursor-pointer active:scale-95 transition ${
              customer.isRegular ? 'border-[#ED2939]' : 'border-[#002395]'
            }`}
          >
            <div className="flex items-center gap-3">
              {/* Avatar */}
              <div className="w-11 h-11 rounded-xl bg-[#002395]/10 flex items-center justify-center flex-shrink-0">
                <span className="text-[#002395] font-bold text-base">
                  {customer.name?.charAt(0).toUpperCase()}
                </span>
              </div>
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-[#0f172a] text-sm">{customer.name}</p>
                  {customer.isRegular && (
                    <span className="bg-[#ED2939]/10 text-[#ED2939] text-xs px-2 py-0.5 rounded-full font-medium">
                      Regular
                    </span>
                  )}
                </div>
                <a href={`tel:${customer.phone}`} className="text-green-600 text-xs mt-0.5 flex items-center">
                  <i className="fas fa-phone mr-1"></i>
                  {customer.phone}
                </a>
                {customer.idType && (
                  <p className="text-gray-400 text-xs mt-0.5">
                    <i className="fas fa-id-card mr-1"></i>
                    {customer.idType}
                  </p>
                )}
              </div>
              <i className="fas fa-chevron-right text-gray-300 flex-shrink-0"></i>
            </div>
          </div>
        ))
      )}
    </div>

    {/* FORM MODAL */}
    {showModal && (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center">
        <div className="bg-white w-full md:max-w-2xl md:mx-auto rounded-t-3xl md:rounded-2xl flex flex-col max-h-[90vh]">
          {/* Modal handle */}
          <div className="md:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
            <div className="w-10 h-1 bg-gray-300 rounded-full"></div>
          </div>
          {/* Modal header - fixed */}
          <div className="flex-shrink-0 px-4 pt-3 pb-3 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#0f172a]">
                Add Customer
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <i className="fas fa-times text-lg"></i>
              </button>
            </div>
          </div>
          {/* Modal content - scrollable */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <CustomerForm
              onSave={handleSaveCustomer}
              onCancel={() => setShowModal(false)}
            />
          </div>
        </div>
      </div>
    )}

    {/* DELETE CONFIRM MODAL */}
    {!!deleteTarget && (
      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        message="Are you sure you want to delete this customer?"
      />
    )}
  </div>
  </Layout>
);
};

export default CustomerList;
