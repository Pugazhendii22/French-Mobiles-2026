import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { doc, getDoc, updateDoc, collection, query, where, limit, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../context/AuthContext';
import { creditWallet } from '../../utils/walletUtils';
import { loadCustomers, rememberCustomer } from '../../utils/customerCache';
import CustomerForm from './CustomerForm';
import Layout from '../../components/common/Layout';
import ImageModal from '../../components/common/ImageModal';
import { imageThumb } from '../../utils/imageUrl';
import { openWhatsApp } from '../../utils/phone';

const CustomerView = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  const quickData = location.state;

  const [customer, setCustomer] = useState(quickData || null);
  const [loading, setLoading] = useState(!quickData);
  const [showEdit, setShowEdit] = useState(false);
  const [showImage, setShowImage] = useState({});
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerUrl, setViewerUrl] = useState('');
  const [viewerTitle, setViewerTitle] = useState('');

  const [sales, setSales] = useState([]);
  const [serviceOrders, setServiceOrders] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');

  const [showAddWallet, setShowAddWallet] = useState(false);
  const [addWalletAmount, setAddWalletAmount] = useState('');
  const [addWalletReason, setAddWalletReason] = useState('');

  const normalizePhone = (phone) => {
    if (!phone) return "";
    return phone.toString().replace(/\s+/g, "").replace(/^\+91/, "").replace(/^0/, "").trim();
  };

  const fetchCustomerData = async () => {
    setHistoryError('');
    try {
      const docRef = doc(db, 'customers', id);

      /* This page used to read the whole customers collection, plus the last
         hundred sales and the last hundred service orders shop-wide, and sift
         them here - a few hundred reads to open one customer, and a history
         that silently went empty once a customer's last bill fell outside
         those hundred. Both are now fetched by who they belong to, and the
         duplicate-name check reads the copy already on the phone. */
      const [docSnap, allCustomers] = await Promise.all([
        getDoc(docRef),
        loadCustomers().catch(() => []),
      ]);

      if (docSnap.exists()) {
        const raw = docSnap.data();
        // Auto-migrate: add wallet fields if missing on existing customers
        if (raw.walletBalance === undefined || raw.walletHistory === undefined) {
          await updateDoc(docRef, {
            walletBalance: raw.walletBalance ?? 0,
            walletHistory: raw.walletHistory ?? [],
            updatedAt: new Date().toISOString()
          });
        }
        const custData = { id: docSnap.id, ...raw, walletBalance: raw.walletBalance ?? 0, walletHistory: raw.walletHistory ?? [] };
        setCustomer(custData);
        rememberCustomer(custData);
        setLoading(false);

        const customerNameLower = custData.name ? custData.name.toLowerCase() : "";
        // Two customers sharing a name means a bill carrying only a name cannot
        // be attributed to either, so those are left out below.
        const hasNameDuplicates = allCustomers.filter(
          c => c.name && c.name.toLowerCase() === customerNameLower
        ).length > 1;

        /* A bill written before customerId existed carries only the phone, and
           the shop has typed that phone every way there is, so ask for the
           spellings this customer could have been written as. */
        const phoneVariants = new Set();
        [custData.phone, custData.alternatePhone].forEach(value => {
          const national = normalizePhone(value);
          if (!national) return;
          [value, national, `+91${national}`, `91${national}`, `0${national}`]
            .filter(Boolean)
            .forEach(variant => phoneVariants.add(String(variant)));
        });
        const phones = [...phoneVariants].slice(0, 30);   // Firestore caps 'in' at 30

        const ownedBy = async (collectionName) => {
          const ref = collection(db, collectionName);
          const queries = [
            getDocs(query(ref, where('customerId', '==', custData.id), limit(50))),
          ];
          if (phones.length) {
            queries.push(getDocs(query(ref, where('customerPhone', 'in', phones), limit(50))));
          }
          // Oldest records carry only a name. That is safe to go on when no
          // other customer shares the name - the same rule this page used.
          if (custData.name && !hasNameDuplicates) {
            queries.push(getDocs(query(ref, where('customerName', '==', custData.name), limit(50))));
          }

          const found = new Map();
          const results = await Promise.allSettled(queries);
          results.forEach(result => {
            if (result.status !== 'fulfilled') {
              console.error(`${collectionName} history query failed:`, result.reason);
              return;
            }
            result.value.forEach(d => found.set(d.id, { id: d.id, ...d.data() }));
          });

          return [...found.values()]
            .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
            .slice(0, 20);
        };

        const [salesData, serviceData] = await Promise.all([
          ownedBy('sales'),
          ownedBy('service_orders'),
        ]);

        setSales(salesData);
        setServiceOrders(serviceData);
      } else {
        if (!quickData) setCustomer(null);
        console.error("No such customer!");
      }
    } catch (err) {
      console.error(err);
      setHistoryError('Could not load history. Please try again.');
    } finally {
      setLoading(false);
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomerData();
  }, [id]);

  useEffect(() => {
    if (showEdit) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => { document.body.style.overflow = "unset"; };
  }, [showEdit]);

  const handleUpdate = async (data) => {
    const updatedData = { ...data, updatedAt: new Date().toISOString() };
    await updateDoc(doc(db, 'customers', id), updatedData);
    setCustomer({ id, ...updatedData });
    rememberCustomer({ id, ...updatedData });
    setShowEdit(false);
    // Refresh history silently
    fetchCustomerData();
  };

  const formatDate = (dateValue) => {
    if (!dateValue) return '';
    const date = typeof dateValue.toDate === 'function' ? dateValue.toDate() : new Date(dateValue);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-GB'); 
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Received': return 'bg-blue-100 text-[#002395]';
      case 'In Progress': return 'bg-yellow-100 text-yellow-700';
      case 'Parts Awaiting': return 'bg-orange-100 text-orange-700';
      case 'Completed': return 'bg-green-100 text-green-600';
      case 'Awaiting Customer Approval': return 'bg-purple-100 text-purple-700';
      case 'Returned': return 'bg-red-100 text-[#ED2939]';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  if (!loading && !customer) return <div className="p-4 md:p-8 text-center text-[#ED2939] font-bold">Customer not found</div>;

  const totalPurchases = sales.length;
  const totalSpent = sales.reduce((sum, sale) => sum + (Number(sale.totalAmount) || 0), 0);
  const totalBalanceDue = sales.reduce((sum, sale) => sum + (Number(sale.balanceDue) || 0), 0);
  const totalServices = serviceOrders.length;

  return (
  <Layout title="Customer Details" pageType="detail" backTo="/customers">
    <div className="min-h-screen bg-[#f8fafc] pb-24">

      {/* HEADER */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-30 shadow-sm">
        <button onClick={() => navigate('/customers')} className="text-[#002395] p-1">
        <i className="fas fa-arrow-left text-lg"></i>
      </button>
      <h1 className="text-lg font-bold text-[#0f172a] flex-1">Customer Details</h1>
    </div>

    <div className="px-4 py-4 space-y-4">

      {/* PROFILE CARD */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-[#002395] flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-2xl">
              {customer?.name?.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-[#0f172a]">{customer?.name}</h2>
            {customer?.isRegular && (
              <span className="bg-[#ED2939]/10 text-[#ED2939] text-xs px-3 py-1 rounded-full font-semibold">
                Regular Customer
              </span>
            )}
          </div>
        </div>

        {/* CONTACT INFO */}
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0">
              <i className="fas fa-phone text-green-600 text-sm"></i>
            </div>
              <div>
              <p className="text-xs text-gray-400">Phone</p>
              {customer?.phone ? (
                <a href={`tel:${customer.phone}`} className="font-semibold text-green-600 text-sm flex items-center gap-1">
                  <i className="fas fa-phone text-xs"></i>
                  {customer.phone}
                </a>
              ) : (
                <p className="font-semibold text-[#0f172a] text-sm">-</p>
              )}
            </div>
          </div>
          {customer?.alternatePhone && (
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                <i className="fas fa-phone-alt text-[#002395] text-sm"></i>
              </div>
              <div>
                <p className="text-xs text-gray-400">Alternate Phone</p>
                {customer?.alternatePhone ? (
                  <a href={`tel:${customer.alternatePhone}`} className="font-semibold text-green-600 text-sm flex items-center gap-1">
                    <i className="fas fa-phone text-xs"></i>
                    {customer.alternatePhone}
                  </a>
                ) : (
                  <p className="font-semibold text-[#0f172a] text-sm">-</p>
                )}
              </div>
            </div>
          )}
          {customer?.email && (
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center flex-shrink-0">
                <i className="fas fa-envelope text-purple-600 text-sm"></i>
              </div>
              <div>
                <p className="text-xs text-gray-400">Email</p>
                <p className="font-semibold text-[#0f172a] text-sm break-all">{customer?.email}</p>
              </div>
            </div>
          )}
          {customer?.address && (
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0">
                <i className="fas fa-map-marker-alt text-orange-500 text-sm"></i>
              </div>
              <div>
                <p className="text-xs text-gray-400">Address</p>
                <p className="font-semibold text-[#0f172a] text-sm">{customer?.address}</p>
              </div>
            </div>
          )}
        </div>

        {/* ACTION BUTTONS */}
        <div className="flex gap-3 mt-4 pt-4 border-t border-gray-100">
          <button
            onClick={() => setShowEdit(true)}
            className="flex-1 bg-[#002395] text-white rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-2"
          >
            <i className="fas fa-edit"></i> Edit
          </button>
          <button
            onClick={() => openWhatsApp(customer?.phone || customer?.alternatePhone)}
            className="flex-1 bg-green-500 text-white rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-2"
          >
            <i className="fab fa-whatsapp"></i> WhatsApp
          </button>
        </div>
      </div>

      {/* STATS CARDS */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 text-center">
          <p className="text-xs text-gray-400 mb-1">Purchases</p>
          <p className="text-2xl font-bold text-[#002395]">{sales.length}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 text-center">
          <p className="text-xs text-gray-400 mb-1">Total Spent</p>
          <p className="text-2xl font-bold text-[#002395]">
            ₹{sales.reduce((sum, s) => sum + (s.totalAmount || 0), 0)}
          </p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 text-center">
          <p className="text-xs text-gray-400 mb-1">Service Orders</p>
          <p className="text-2xl font-bold text-[#ED2939]">{serviceOrders.length}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 text-center">
          <p className="text-xs text-gray-400 mb-1">Balance Due</p>
          <p className="text-2xl font-bold text-orange-500">
            ₹{sales.reduce((sum, s) => sum + (s.balanceDue || 0), 0)}
          </p>
        </div>
      </div>

      {/* WALLET */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
          <i className="fas fa-wallet mr-2"></i>Wallet
        </p>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs text-gray-400">Current Balance</p>
            <p className="text-2xl font-bold text-[#002395]">₹{customer?.walletBalance || 0}</p>
          </div>
          <button
            onClick={() => setShowAddWallet(true)}
            className="bg-[#002395]/10 text-[#002395] px-4 py-2 rounded-xl text-sm font-semibold"
          >
            <i className="fas fa-plus mr-1"></i>Add
          </button>
        </div>
        {customer?.walletHistory?.length > 0 && (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {[...(customer.walletHistory || [])].reverse().map((tx, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                <div>
                  <p className="text-xs font-medium text-[#0f172a]">
                    {tx.reason === 'auto_credit' ? 'Auto Credit (No discount)' :
                     tx.reason === 'manual_credit' ? 'Manual Credit' :
                     'Used in Sale'}
                  </p>
                  <p className="text-xs text-gray-400">
                    {tx.date?.toDate?.()?.toLocaleDateString('en-IN')}
                  </p>
                </div>
                <p className={`text-sm font-bold ${
                  tx.type === 'credit' ? 'text-green-600' : 'text-[#ED2939]'
                }`}>
                  {tx.type === 'credit' ? '+' : '-'}₹{Math.abs(tx.amount)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ID DETAILS */}
      {(customer?.idType || customer?.idNumber) && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
            ID Details
          </p>
          <div className="grid grid-cols-2 gap-3">
            {customer?.idType && (
              <div>
                <p className="text-xs text-gray-400">ID Type</p>
                <p className="font-semibold text-[#0f172a] text-sm">{customer.idType}</p>
              </div>
            )}
            {customer?.idNumber && (
              <div>
                <p className="text-xs text-gray-400">ID Number</p>
                <p className="font-semibold text-[#0f172a] text-sm">{customer.idNumber}</p>
              </div>
            )}
          </div>
        </div>
      )}
      {/* IMAGES */}
      {(customer?.photoUrl || customer?.idProofUrl) && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
            Photos
          </p>
          <div className="grid grid-cols-2 gap-3">
            {customer?.photoUrl && (
              <div>
                <p className="text-xs text-gray-400 mb-1">Customer Photo</p>
                {showImage?.customerPhoto ? (
                  <div className="relative">
                    <img
                      src={imageThumb(customer.photoUrl, 320)}
                      alt="Customer"
                      loading="lazy"
                      decoding="async"
                      className="w-full h-40 object-cover rounded-xl cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => {
                        setViewerUrl(customer.photoUrl);
                        setViewerTitle('Customer Photo');
                        setViewerOpen(true);
                      }}
                      onError={(e) => { e.target.style.display='none' }}
                    />
                    <button
                      onClick={() => setShowImage(prev => ({...prev, customerPhoto: false}))}
                      className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded-lg"
                    >
                      Hide
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowImage(prev => ({...prev, customerPhoto: true}))}
                    className="w-full h-16 border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center gap-2 text-[#002395] text-sm font-medium"
                  >
                    <i className="fas fa-image"></i> View Photo
                  </button>
                )}
              </div>
            )}

            {customer?.idProofUrl && (
              <div>
                <p className="text-xs text-gray-400 mb-1">ID Proof</p>
                {showImage?.idProof ? (
                  <div className="relative">
                    <img
                      src={imageThumb(customer.idProofUrl, 320)}
                      alt="ID Proof"
                      loading="lazy"
                      decoding="async"
                      className="w-full h-40 object-cover rounded-xl cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => {
                        setViewerUrl(customer.idProofUrl);
                        setViewerTitle('ID Proof');
                        setViewerOpen(true);
                      }}
                      onError={(e) => { e.target.style.display='none' }}
                    />
                    <button
                      onClick={() => setShowImage(prev => ({...prev, idProof: false}))}
                      className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded-lg"
                    >
                      Hide
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowImage(prev => ({...prev, idProof: true}))}
                    className="w-full h-16 border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center gap-2 text-[#002395] text-sm font-medium"
                  >
                    <i className="fas fa-id-card"></i> View ID Proof
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
          Purchase History
        </p>
        {sales.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">No purchases yet</p>
        ) : (
          <div className="space-y-3">
            {sales.map(sale => (
              <div
                key={sale.id}
                onClick={() => navigate(`/sales/${sale.id}`)}
                className="border-l-4 border-[#002395] bg-[#f8fafc] rounded-xl p-3 cursor-pointer active:scale-95 transition"
              >
                <div className="flex justify-between items-start">
                  <p className="text-xs font-bold text-[#002395]">{sale.invoiceNumber}</p>
                  <p className="text-xs text-gray-400">
                    {sale.createdAt?.toDate?.()?.toLocaleDateString('en-IN') || new Date(sale.createdAt).toLocaleDateString('en-IN')}
                  </p>
                </div>
                <p className="text-sm font-semibold text-[#0f172a] mt-1">₹{sale.totalAmount}</p>
                {sale.balanceDue > 0 && (
                  <span className="text-xs bg-[#ED2939]/10 text-[#ED2939] px-2 py-0.5 rounded-full">
                    Due: ₹{sale.balanceDue}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SERVICE HISTORY */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <p className="text-xs font-bold text-[#ED2939] uppercase tracking-wide mb-3 border-l-4 border-[#ED2939] pl-3">
          Service History
        </p>
        {serviceOrders.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">No service orders yet</p>
        ) : (
          <div className="space-y-3">
            {serviceOrders.map(order => (
              <div
                key={order.id}
                onClick={() => navigate(`/service/${order.id}`)}
                className="border-l-4 border-[#ED2939] bg-[#f8fafc] rounded-xl p-3 cursor-pointer active:scale-95 transition"
              >
                <div className="flex justify-between items-start">
                  <p className="text-xs font-bold text-[#ED2939]">{order.orderNumber}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    order.status === 'Completed' ? 'bg-green-100 text-green-700' :
                    order.status === 'In Progress' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {order.status}
                  </span>
                </div>
                <p className="text-sm font-semibold text-[#0f172a] mt-1">
                  {order.brand} {order.model}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">₹{order.estimatedPrice}</p>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>

    {/* EDIT MODAL */}
    {showEdit && (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center">
        <div className="bg-white w-full md:max-w-2xl md:mx-auto rounded-t-3xl md:rounded-2xl flex flex-col max-h-[90vh]">
          <div className="md:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
            <div className="w-10 h-1 bg-gray-300 rounded-full"></div>
          </div>
          <div className="flex-shrink-0 px-4 pt-3 pb-3 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#0f172a]">Edit Customer</h2>
              <button onClick={() => setShowEdit(false)} className="text-gray-400 p-1">
                <i className="fas fa-times text-lg"></i>
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <CustomerForm
              initialData={customer}
              onSave={handleUpdate}
              onCancel={() => setShowEdit(false)}
            />
          </div>
        </div>
      </div>
    )}

      {/* ADD WALLET MODAL */}
      {showAddWallet && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center">
          <div className="bg-white w-full md:max-w-sm md:mx-auto rounded-t-3xl md:rounded-2xl flex flex-col">
            <div className="md:hidden flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-300 rounded-full"></div>
            </div>
            <div className="flex-shrink-0 px-4 pt-3 pb-3 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-[#0f172a]">Add to Wallet</h2>
                <button onClick={() => setShowAddWallet(false)} className="text-gray-400 p-1">
                  <i className="fas fa-times text-lg"></i>
                </button>
              </div>
            </div>
            <div className="px-4 py-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                <input
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={addWalletAmount}
                  onChange={e => setAddWalletAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason (optional)</label>
                <input
                  type="text"
                  value={addWalletReason}
                  onChange={e => setAddWalletReason(e.target.value)}
                  placeholder="e.g. Goodwill credit"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]"
                />
              </div>
            </div>
            <div className="px-4 py-3 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => setShowAddWallet(false)}
                className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!addWalletAmount || Number(addWalletAmount) <= 0) return
                  await creditWallet(
                    customer.id,
                    Number(addWalletAmount),
                    'manual_credit',
                    addWalletReason || 'Manual top-up',
                    currentUser.uid
                  )
                  setShowAddWallet(false)
                  setAddWalletAmount('')
                  setAddWalletReason('')
                  fetchCustomerData()
                }}
                className="flex-1 bg-[#002395] text-white rounded-xl py-2.5 text-sm font-semibold"
              >
                Add to Wallet
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
    
    <ImageModal
      isOpen={viewerOpen}
      onClose={() => setViewerOpen(false)}
      imageUrl={viewerUrl}
      title={viewerTitle}
    />
    </Layout>
  );
};

export default CustomerView;
