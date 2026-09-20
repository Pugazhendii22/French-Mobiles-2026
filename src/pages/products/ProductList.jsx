import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../../components/common/Layout';
import ProductForm from './ProductForm';
import { useAuth } from '../../context/AuthContext';
import ConfirmDeleteModal from '../../components/ConfirmDeleteModal';

const ProductList = () => {
  const { userRole } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchProducts = async () => {
    try {
      const snap = await getDocs(collection(db, 'products'));
      const list = [];
      snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setProducts(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleSaveProduct = async (data) => {
    if (data.id) {
      const { id, ...updateData } = data;
      await import('firebase/firestore').then(m => m.updateDoc(m.doc(db, 'products', id), updateData));
      fetchProducts();
      return id;
    }
    const docRef = await addDoc(collection(db, 'products'), data);
    fetchProducts();
    return docRef.id;
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'products', deleteTarget.id));
      setProducts(prev => prev.filter(p => p.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) { console.error(err); }
    finally { setDeleting(false); }
  };

  const filteredProducts = products.filter(p => {
    const q = searchQuery.replace(/\s+/g, '').toLowerCase();
    const matchesSearch = !searchQuery || 
      (p.name?.replace(/\s+/g, '').toLowerCase() || '').includes(q) ||
      (p.brand?.replace(/\s+/g, '').toLowerCase() || '').includes(q) ||
      (p.category?.replace(/\s+/g, '').toLowerCase() || '').includes(q) ||
      Boolean(p.compatibleModels?.some(m => (m || '').replace(/\s+/g, '').toLowerCase().includes(q)));
    
    const matchesCategory = !categoryFilter || p.category === categoryFilter;
    const matchesStatus = !statusFilter || p.status === statusFilter;

    return matchesSearch && matchesCategory && matchesStatus;
  });

  const statusColor = (s) => ({ 'in stock': 'bg-green-100 text-green-800', 'low stock': 'bg-yellow-100 text-yellow-800', 'out of stock': 'bg-red-100 text-red-800' }[s] || 'bg-gray-100 text-gray-800');

  const fab = (
    <button
      onClick={() => setShowModal(true)}
      className="w-14 h-14 rounded-full bg-[#002395] text-white flex items-center justify-center hover:bg-[#001a7a] transition-all sm:hidden"
      style={{ boxShadow: '0 4px 12px rgba(0, 35, 149, 0.18)' }}
      aria-label="Add Product"
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
    <Layout title="Products Inventory" pageType="list" fab={fab}>
      <div className="min-h-screen bg-[#f8fafc] pb-24">

        {/* HEADER */}
        <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-30 shadow-sm">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-[#0f172a]">Products</h1>
            <span className="bg-[#002395] text-white text-xs font-bold px-2.5 py-1 rounded-full">
              {products.length}
            </span>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="hidden md:flex items-center gap-2 bg-[#002395] text-white px-4 py-2 rounded-xl text-sm font-semibold"
          >
            <i className="fas fa-plus"></i> Add Product
          </button>
        </div>

        {/* SEARCH AND FILTERS */}
        <div className="px-4 pt-3 pb-2 space-y-2">
          <div className="relative">
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
            <input
              type="text"
              placeholder="Search by name, brand, model..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-[#002395] shadow-sm"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#002395]"
            >
              <option value="">All Categories</option>
              <option value="Back Cover">Back Cover</option>
              <option value="Battery">Battery</option>
              <option value="Cable">Cable</option>
              <option value="Charger">Charger</option>
              <option value="Earphones">Earphones</option>
              <option value="Memory Card">Memory Card</option>
              <option value="Power Bank">Power Bank</option>
              <option value="Screen Guard">Screen Guard</option>
              <option value="Tempered Glass">Tempered Glass</option>
              <option value="Other">Other</option>
            </select>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#002395]"
            >
              <option value="">All Status</option>
              <option value="in stock">In Stock</option>
              <option value="low stock">Low Stock</option>
              <option value="out of stock">Out of Stock</option>
            </select>
          </div>
        </div>

        {/* PRODUCT CARDS */}
        <div className="px-4 space-y-3">
          {loading ? (
            <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="bg-white rounded-2xl h-24 animate-pulse" />)}</div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-16">
              <i className="fas fa-box text-4xl text-gray-200 mb-3 block"></i>
              <p className="text-gray-400 text-sm">No products found</p>
            </div>
          ) : (
            filteredProducts.map(p => (
              <Link
                key={p.id}
                to={`/products/${p.id}`}
                className={`block bg-white rounded-2xl border-l-4 shadow-sm p-4 active:scale-95 transition ${
                  p.status === 'out of stock' ? 'border-[#ED2939]' :
                  p.status === 'low stock' ? 'border-orange-500' :
                  'border-green-500'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-[#0f172a] text-sm">{p.name}</p>
                      {p.compatibleModels?.length > 0 && (
                        <span className="bg-[#002395]/10 text-[#002395] text-xs px-2 py-0.5 rounded-full">
                          {p.compatibleModels.length} models
                        </span>
                      )}
                    </div>
                    <p className="text-gray-400 text-xs mt-0.5">
                      {p.brand && `${p.brand} · `}{p.category}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        p.status === 'out of stock' ? 'bg-red-100 text-[#ED2939]' :
                        p.status === 'low stock' ? 'bg-orange-100 text-orange-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {(p.status || '').charAt(0).toUpperCase() + (p.status || '').slice(1)}
                      </span>
                      <span className="text-xs text-gray-400">{p.stock} units</span>
                    </div>
                  </div>
                   <div className="flex flex-col items-end gap-1">
                    <p className="font-bold text-[#002395] text-base">₹{p.salePrice}</p>
                    {Number(p.stock || 0) > 0 && (
                      <button
                        onClick={e => {
                          e.preventDefault();
                          e.stopPropagation();
                          navigate('/sales', {
                            state: {
                              items: [
                                {
                                  type: 'New',
                                  itemId: p.id,
                                  name: p.name,
                                  quantity: 1,
                                  unitPrice: Number(p.salePrice || p.price || 0),
                                  purchaseCost: Number(p.purchasePrice || 0),
                                  repairCost: 0,
                                  imei: ''
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
                    <i className="fas fa-chevron-right text-gray-300 text-xs"></i>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>

        {showModal && (
            <ProductForm onSave={handleSaveProduct} onCancel={() => setShowModal(false)} />
          )}

        <ConfirmDeleteModal
          isOpen={!!deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          deleting={deleting}
          title="Delete Product"
          message="Are you sure you want to delete this product? This action cannot be undone."
        />
      </div>
    </Layout>
  );
};

export default ProductList;

