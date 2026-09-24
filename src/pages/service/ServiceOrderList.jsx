import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, doc, updateDoc, query, where, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useNavigate, useLocation } from 'react-router-dom';
import Layout from '../../components/common/Layout';
import ServiceOrderForm from './ServiceOrderForm';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { creditWallet } from '../../utils/walletUtils';
import NewSaleModal from '../../components/sales/NewSaleModal';
import ConfirmDeleteModal from '../../components/ConfirmDeleteModal';
import { nextDailyNumber } from '../../utils/counters';
import { loadCustomers } from '../../utils/customerCache';
import { SearchBar, CollapsibleFilter, EmptyState, ListSkeleton, Chip } from '../../components/common/ui';
import { describeFirebaseError } from '../../utils/firebaseError';

const ServiceOrderList = () => {
  const { currentUser, userName, userRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  /* Arriving from the scanner carries the scanned device in router state.
     Seeded at mount so the prefilled form is open on the first render rather
     than flashing the list first. */
  const [prefillData, setPrefillData] = useState(() => location.state || null);
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [activeTab, setActiveTab] = useState('All');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showModal, setShowModal] = useState(() => !!location.state);

  const { preDeliveryChecklist = [] } = useSettings();
  const [completeModalOpen, setCompleteModalOpen] = useState(false);
  const [selectedOrderForComplete, setSelectedOrderForComplete] = useState(null);
  const normalizeChecklistKey = (label) => label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const createChecklist = (items = []) => {
    return items.reduce((acc, item) => {
      acc[normalizeChecklistKey(item)] = false
      return acc
    }, {})
  }
  const [completeChecklist, setCompleteChecklist] = useState(() => createChecklist(preDeliveryChecklist));
  const [completeError, setCompleteError] = useState('');

  useEffect(() => {
    setCompleteChecklist(prev => {
      const nextChecklist = {}
      preDeliveryChecklist.forEach(item => {
        const key = normalizeChecklistKey(item)
        nextChecklist[key] = prev[key] || false
      })
      return nextChecklist
    })
  }, [preDeliveryChecklist])

  const [billModalOpen, setBillModalOpen] = useState(false);
  const [completedOrderForBill, setCompletedOrderForBill] = useState(null);
  const [newSaleModalOpen, setNewSaleModalOpen] = useState(false);
  const [salePrefillData, setSalePrefillData] = useState(null);

  const [ratingModalOpen, setRatingModalOpen] = useState(false);
  const [ratingDataForModal, setRatingDataForModal] = useState(null);
  const [ratingGenerating, setRatingGenerating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteWarning, setDeleteWarning] = useState('');
  const [whatsAppDialog, setWhatsAppDialog] = useState({ open: false });
  const [showFilters, setShowFilters] = useState(false);

  const STATUSES = ['Received', 'In Progress', 'Parts Awaiting', 'Completed', 'Awaiting Customer Approval', 'Returned'];

  const fetchOrdersAndCustomers = async () => {
    try {
      setCustomers(await loadCustomers());

      let queryRef = collection(db, 'service_orders');
      if (userRole?.toLowerCase() === 'staff') {
        queryRef = query(queryRef, where('technicianUid', '==', currentUser.uid));
      }
      const snap = await getDocs(queryRef);
      const list = [];
      snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setOrders(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadInitialData = async () => {
      await fetchOrdersAndCustomers();
    };
    loadInitialData();
  }, []);

  // Drop the router state so going back or refreshing does not reopen the form.
  useEffect(() => {
    if (location.state) window.history.replaceState({}, document.title);
  }, [location.state]);

  const generateOrderNumber = () =>
    nextDailyNumber({
      kind: 'service_order',
      prefixLabel: 'SRV',
      collectionName: 'service_orders',
      field: 'orderNumber',
    });

  const handleSaveOrder = async (data) => {
    let orderNumber = data.orderNumber;
    if (!orderNumber) {
      orderNumber = await generateOrderNumber();
    }

    const newOrder = {
      ...data,
      orderNumber,
      updatedAt: new Date().toISOString()
    };

    if (!customers.find(c => c.phone === data.customerPhone)) {
      await addDoc(collection(db, 'customers'), {
        name: data.customerName,
        phone: data.customerPhone,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    if (data.id) {
      const { id, ...updateData } = newOrder;
      await import('firebase/firestore').then(m => m.updateDoc(m.doc(db, 'service_orders', id), updateData));
      fetchOrdersAndCustomers();
      return id;
    }

    newOrder.createdAt = new Date().toISOString();
    const docRef = await addDoc(collection(db, 'service_orders'), newOrder);
    fetchOrdersAndCustomers();
    return docRef.id;
  };

  const openCompleteModal = (order) => {
    setSelectedOrderForComplete(order);
    setCompleteChecklist(createChecklist(preDeliveryChecklist));
    setCompleteError('');
    setCompleteModalOpen(true);
  };

  const handleCompleteToggle = (key) => {
    setCompleteChecklist(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleConfirmComplete = async () => {
    const allChecked = Object.values(completeChecklist).every(val => val === true);
    if (!allChecked) {
      setCompleteError('Please complete all checklist items before marking as complete');
      return;
    }

    try {
      const updateData = {
        status: 'Completed',
        preDeliveryChecklist: completeChecklist,
        completedAt: new Date().toISOString(),
        actualCompletedAt: new Date(),
        completedBy: { 
          uid: currentUser?.uid, 
          name: userName || currentUser?.displayName || currentUser?.email || 'Unknown'
        },
        updatedAt: new Date().toISOString()
      };

      await updateDoc(doc(db, 'service_orders', selectedOrderForComplete.id), updateData);

      const order = selectedOrderForComplete
      const hasDiscount = order.discount && Number(order.discount) > 0
      const serviceProfit = (Number(order.estimatedPrice) || 0) -
        (Number(order.rawMaterialCost) || 0) -
        (Number(order.outsideLabourCost) || 0)

      if (!hasDiscount && serviceProfit > 0 && order.customerId) {
        const walletCredit = Math.round(serviceProfit * 0.01)
        if (walletCredit > 0) {
          await creditWallet(
            order.customerId,
            walletCredit,
            'auto_credit',
            order.id,
            currentUser.uid
          )
        }
      }
      
      const finalOrder = { ...selectedOrderForComplete, ...updateData };
      setOrders(orders.map(o => o.id === selectedOrderForComplete.id ? finalOrder : o));
      setCompleteModalOpen(false);

      if (finalOrder.customerPhone) {
        setRatingGenerating(true);
        try {
          const token = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2);
          
          const ratingData = {
            token: token,
            serviceOrderId: finalOrder.id,
            orderNumber: finalOrder.orderNumber,
            customerName: finalOrder.customerName,
            customerPhone: finalOrder.customerPhone,
            brand: finalOrder.brand,
            model: finalOrder.model,
            technicianName: finalOrder.technicianName || '',
            rating: null,
            comment: null,
            status: 'pending',
            createdAt: new Date().toISOString(),
            submittedAt: null,
            isUsed: false
          };
          
          await setDoc(doc(db, 'ratings', token), ratingData);
          await updateDoc(doc(db, 'service_orders', finalOrder.id), { ratingToken: token });
          
          setCompletedOrderForBill(finalOrder);
          setRatingDataForModal(ratingData);
          setRatingModalOpen(true);
        } catch (e) {
          console.error("Error generating rating link:", e);
          setCompletedOrderForBill(finalOrder);
          setBillModalOpen(true);
        } finally {
          setRatingGenerating(false);
        }
      } else {
        setCompletedOrderForBill(finalOrder);
        setBillModalOpen(true);
      }
    } catch (err) {
      console.error('Complete order failed:', err);
      setCompleteError(describeFirebaseError(err));
    }
  };

  const handleSendRatingWhatsApp = () => {
    if (ratingDataForModal) {
      const message = `Hi ${ratingDataForModal.customerName}, your ${ratingDataForModal.brand} ${ratingDataForModal.model} service (₹${completedOrderForBill?.estimatedPrice || 0}) is completed at French Mobiles! 🎉\n\nPlease rate our service:\nhttps://${window.location.host}/rate/${ratingDataForModal.token}\n\nThank you for choosing French Mobiles! 🙏`;
      const phone = ratingDataForModal.customerPhone.replace(/\D/g, '');
      window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(message)}`, '_blank');
    }
    setRatingModalOpen(false);
    setBillModalOpen(true);
  };

  const handleSkipRating = () => {
    setRatingModalOpen(false);
    setBillModalOpen(true);
  };

  const handleCreateBill = (order) => {
    const o = order || completedOrderForBill;
    
    if (o.billCreated) {
      alert("A bill already exists for this order.");
      setBillModalOpen(false);
      return;
    }

    const complaintText = o.complaintTypes?.join(', ') || o.complaintNature || 'Service';
    const billData = {
      saleType: "Service",
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      items: [{ 
        name: `Service - ${complaintText}${o.otherComplaint ? ` - ${o.otherComplaint}` : ''}`, 
        quantity: 1, 
        unitPrice: Number(o.estimatedPrice) || 0 
      }],
      serviceOrderId: o.id,
      serviceOrderNumber: o.orderNumber
    };
    setSalePrefillData(billData);
    setBillModalOpen(false);
    setNewSaleModalOpen(true);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Received': return 'bg-blue-100 text-blue-800';
      case 'In Progress': return 'bg-yellow-100 text-yellow-800';
      case 'Parts Awaiting': return 'bg-orange-100 text-orange-800';
      case 'Completed': return 'bg-green-100 text-green-800';
      case 'Awaiting Customer Approval': return 'bg-purple-100 text-purple-800';
      case 'Returned': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const handleDeleteClick = (o) => {
    const active = o.status === 'In Progress' || o.status === 'Completed';
    setDeleteWarning(active ? `This order is active (status: ${o.status}). Are you sure you want to delete it?` : 'Are you sure you want to delete this service order? This action cannot be undone.');
    setDeleteTarget(o);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'service_orders', deleteTarget.id));
      setOrders(prev => prev.filter(o => o.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) { console.error(err); }
    finally { setDeleting(false); }
  };

  const openWhatsApp = (order) => {
    const phone = order.customerPhone.replace(/\D/g, '');
    const message = `Hi ${order.customerName}, regarding your service order ${order.orderNumber} for ${order.brand} ${order.model}. - French Mobiles`;
    window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handleQuickStatusChange = async (order, newStatus) => {
    if (order.status === newStatus) return

    // Check access - staff can only change their own orders
    if (userRole === 'staff' && order.technicianUid !== currentUser?.uid) {
      alert('You can only change status of orders assigned to you.')
      return
    }

    // Staff cannot modify completed orders or bills
    if (userRole?.toLowerCase() === 'staff' && (order.status === 'Completed' || order.billCreated)) {
      alert('Completed orders and bills can only be changed by admin.')
      return
    }

    try {
      // Update Firestore
      const updateData = { status: newStatus, updatedAt: new Date() }
      if (newStatus === 'Completed') {
        updateData.actualCompletedAt = new Date()
      }
      await updateDoc(doc(db, 'service_orders', order.id), updateData)

      // Update local state immediately
      setOrders(prev => prev.map(o => 
        o.id === order.id ? { ...o, status: newStatus } : o
      ))

      // Generate WhatsApp message based on new status
      const phone = order.customerPhone || order.alternatePhone
      if (phone) {
        let message = ''
        
        if (newStatus === 'Received') {
          message = `Hi ${order.customerName}, we have received your ${order.brand} ${order.model} for service. Order: ${order.orderNumber}. We will update you shortly. - French Mobiles`
        } else if (newStatus === 'In Progress') {
          message = `Hi ${order.customerName}, your ${order.brand} ${order.model} (Order: ${order.orderNumber}) is now being worked on by our technician. We will notify you once done. - French Mobiles`
        } else if (newStatus === 'Parts Awaiting') {
          message = `Hi ${order.customerName}, we are waiting for parts for your ${order.brand} ${order.model} (Order: ${order.orderNumber}). We will update you as soon as parts arrive. - French Mobiles`
        } else if (newStatus === 'Awaiting Customer Approval') {
          message = `Hi ${order.customerName}, your ${order.brand} ${order.model} (Order: ${order.orderNumber}) requires your approval for additional work. Please visit or call us. - French Mobiles`
        } else if (newStatus === 'Completed') {
          const finalAmount = order.estimatedPrice || 0
          const advance = order.advancePaid || 0
          const balance = finalAmount - advance
          message = `Hi ${order.customerName}, your ${order.brand} ${order.model} (Order: ${order.orderNumber}) is ready for pickup! 🎉\n\nService Amount: Rs.${finalAmount}\nAdvance Paid: Rs.${advance}\nBalance Due: Rs.${balance}\n\nPlease visit us to collect your device. - French Mobiles`
        } else if (newStatus === 'Returned') {
          message = `Hi ${order.customerName}, your ${order.brand} ${order.model} (Order: ${order.orderNumber}) has been returned. Thank you for choosing French Mobiles. - French Mobiles`
        }

        if (message) {
          // Show WhatsApp confirmation dialog
          setWhatsAppDialog({
            open: true,
            phone: phone,
            message: message,
            customerName: order.customerName,
            newStatus: newStatus
          })
        }
      }

    } catch (error) {
      console.error('Status update error:', error)
      alert('Failed to update status. Please try again.')
    }
  };

  const normalizeDate = (value) => {
    if (!value) return null;
    const date = value?.toDate ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const isDueTodayDate = (date) => {
    if (!date) return false;
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return date >= start && date < end;
  };

  const isOrderOverdue = (o) => {
    const expected = normalizeDate(o.expectedCompletionAt);
    return expected && expected < new Date() && o.status !== 'Completed' && o.status !== 'Returned';
  };

  const isOrderDueToday = (o) => {
    const expected = normalizeDate(o.expectedCompletionAt);
    return expected && isDueTodayDate(expected) && o.status !== 'Completed' && o.status !== 'Returned';
  };

  const overdueCount = orders.filter(isOrderOverdue).length;
  const dueTodayCount = orders.filter(isOrderDueToday).length;

  const filteredOrders = orders.filter(o => {
    const q = searchQuery.replace(/\s+/g, '').toLowerCase();
    const matchesSearch = !searchQuery || 
      (o.customerName?.replace(/\s+/g, '').toLowerCase() || '').includes(q) ||
      (o.customerPhone?.replace(/\s+/g, '').toLowerCase() || '').includes(q) ||
      (o.orderNumber?.replace(/\s+/g, '').toLowerCase() || '').includes(q) ||
      (o.brand?.replace(/\s+/g, '').toLowerCase() || '').includes(q) ||
      (o.model?.replace(/\s+/g, '').toLowerCase() || '').includes(q);
    
    const matchesStatus = !statusFilter || o.status === statusFilter;
    const matchesTab = activeTab === 'All' ||
      (activeTab === 'Overdue' && isOrderOverdue(o)) ||
      (activeTab === 'Due Today' && isOrderDueToday(o)) ||
      (activeTab === 'Completed' && o.status === 'Completed');
    
    // Date filtering
    const orderDate = o.createdAt ? new Date(o.createdAt) : null;
    const matchesFrom = !fromDate || (orderDate && orderDate >= new Date(fromDate));
    const matchesTo = !toDate || (orderDate && orderDate <= new Date(toDate + 'T23:59:59'));
    
    return matchesSearch && matchesStatus && matchesTab && matchesFrom && matchesTo;
  });

  const fab = (
    <button
      onClick={() => setShowModal(true)}
      className="w-14 h-14 rounded-full bg-[#002395] text-white flex items-center justify-center"
      style={{ boxShadow: '0 6px 18px rgba(0, 35, 149, 0.35)' }}
      aria-label="New Service Order"
    >
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/></svg>
    </button>
  );

  useEffect(() => {
    if (showModal || completeModalOpen || billModalOpen || deleteTarget) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => { document.body.style.overflow = "unset"; };
  }, [showModal, completeModalOpen, billModalOpen, deleteTarget]);

  const dateFilterActive = Boolean(fromDate || toDate);
  const TABS = ['All', 'Due Today', 'Overdue', 'In Progress', 'Parts Awaiting', 'Awaiting Customer Approval', 'Completed', 'Returned'];

  const isTabActive = (tab) => {
    if (tab === 'Overdue') return activeTab === 'Overdue';
    if (tab === 'Due Today') return activeTab === 'Due Today';
    if (tab === 'All') return activeTab === 'All' && !statusFilter;
    return activeTab === 'All' && statusFilter === tab;
  };

  return (
    <Layout title="Service Orders" pageType="list" fab={fab}>
      <div className="max-w-3xl mx-auto space-y-3">

        <SearchBar
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onClear={() => setSearchQuery('')}
          placeholder="Search name, phone, order no. or device"
        />

        {/* ── STATUS TABS ── */}
        <div className="flex overflow-x-auto hide-scrollbar gap-2 -mx-4 px-4 py-0.5">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => {
                if (tab === 'Overdue') {
                  setActiveTab('Overdue');
                  setStatusFilter('');
                } else if (tab === 'Due Today') {
                  setActiveTab('Due Today');
                  setStatusFilter('');
                } else if (tab === 'All') {
                  setActiveTab('All');
                  setStatusFilter('');
                } else {
                  setActiveTab('All');
                  setStatusFilter(tab);
                }
              }}
              className={`whitespace-nowrap px-4 py-2 rounded-xl text-sm font-semibold shrink-0 transition ${
                isTabActive(tab)
                  ? 'bg-[#002395] text-white shadow-sm'
                  : 'bg-white border border-[#e2e8f0] text-[#64748b]'
              }`}
            >
              {tab}
              {tab === 'Overdue' && overdueCount > 0 && (
                <span className={`ml-2 px-1.5 py-0.5 rounded-full text-[10px] ${isTabActive(tab) ? 'bg-white/25 text-white' : 'bg-[#ED2939] text-white'}`}>
                  {overdueCount}
                </span>
              )}
              {tab === 'Due Today' && dueTodayCount > 0 && (
                <span className={`ml-2 px-1.5 py-0.5 rounded-full text-[10px] ${isTabActive(tab) ? 'bg-white/25 text-white' : 'bg-orange-500 text-white'}`}>
                  {dueTodayCount}
                </span>
              )}
            </button>
          ))}
        </div>

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
            {filteredOrders.length} of {orders.length} {orders.length === 1 ? 'order' : 'orders'}
          </p>
        )}

        {/* ── ORDER CARDS ── */}
        {loading ? (
          <ListSkeleton count={4} height="h-36" />
        ) : filteredOrders.length === 0 ? (
          <EmptyState icon="fa-clipboard-list" title="No service orders found" hint="Try a different tab, search or date range" />
        ) : (
          <div className="space-y-3">
            {filteredOrders.map(order => {
              const isOverdue = order.status !== 'Completed' &&
                                order.expectedCompletionAt &&
                                new Date(order.expectedCompletionAt.toDate?.() || order.expectedCompletionAt) < new Date();
              const done = order.status === 'Completed';

              return (
                <div
                  key={order.id}
                  onClick={() => navigate(`/service/${order.id}`)}
                  className={`bg-white rounded-2xl shadow-sm border-l-4 overflow-hidden cursor-pointer ${
                    isOverdue ? 'border-[#ED2939]' : done ? 'border-green-500' : 'border-[#002395]'
                  }`}
                >
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-bold text-[#002395] font-mono">{order.orderNumber}</p>
                        <h3 className="text-sm font-bold text-[#0f172a] mt-0.5 truncate">{order.customerName}</h3>
                        {order.customerPhone && (
                          <a
                            href={`tel:${order.customerPhone}`}
                            onClick={e => e.stopPropagation()}
                            className="inline-flex items-center gap-1.5 text-green-600 font-semibold text-xs mt-1"
                          >
                            <i className="fas fa-phone text-[10px]"></i>{order.customerPhone}
                          </a>
                        )}
                      </div>
                      {order.estimatedPrice > 0 && (
                        <p className="font-bold text-[#002395] text-base shrink-0 leading-tight">₹{order.estimatedPrice}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <Chip className="bg-gray-100 text-gray-700">{order.brand} {order.model}</Chip>
                      {isOverdue && <Chip className="bg-[#ED2939]/10 text-[#ED2939]">Overdue</Chip>}
                    </div>

                    {/* Status is the field staff change most, so it stays a direct control */}
                    <div className="mt-3">
                      <select
                        value={order.status}
                        onChange={e => handleQuickStatusChange(order, e.target.value)}
                        onClick={e => e.stopPropagation()}
                        onMouseDown={e => e.stopPropagation()}
                        className={`w-full text-xs px-3 py-2.5 rounded-xl border-0 font-bold focus:outline-none ${
                          order.status === 'Completed' ? 'bg-green-100 text-green-700' :
                          order.status === 'In Progress' ? 'bg-yellow-100 text-yellow-700' :
                          order.status === 'Parts Awaiting' ? 'bg-orange-100 text-orange-700' :
                          order.status === 'Returned' ? 'bg-red-100 text-[#ED2939]' :
                          order.status === 'Awaiting Customer Approval' ? 'bg-purple-100 text-purple-700' :
                          'bg-blue-100 text-blue-700'
                        }`}
                      >
                        <option value="Received">Received</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Parts Awaiting">Parts Awaiting</option>
                        <option value="Awaiting Customer Approval">Awaiting Customer Approval</option>
                        <option value="Returned">Returned</option>
                      </select>
                    </div>

                    {order.status !== 'Completed' && order.status !== 'Returned' && (
                      <button
                        onClick={e => { e.stopPropagation(); openCompleteModal(order); }}
                        className="w-full bg-[#002395] text-white py-2.5 rounded-xl text-xs font-bold mt-2"
                      >
                        <i className="fas fa-check mr-1.5"></i>Complete
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── PRE-DELIVERY CHECKLIST SHEET ── */}
        {completeModalOpen && selectedOrderForComplete && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center animate-fade-in">
            <div className="bg-[#f1f5f9] w-full md:max-w-md md:mx-auto rounded-t-3xl md:rounded-2xl flex flex-col h-[90dvh] md:h-auto md:max-h-[90vh] overflow-hidden">
              <div className="md:hidden flex justify-center pt-2.5 pb-1 bg-white">
                <div className="w-10 h-1 bg-gray-300 rounded-full"></div>
              </div>
              <div className="flex justify-between items-center px-4 pt-2 pb-3 border-b border-gray-100 bg-white">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-[#0f172a]">Pre-Delivery Checklist</h2>
                  <p className="text-xs text-gray-400 truncate">{selectedOrderForComplete.orderNumber}</p>
                </div>
                <button onClick={() => setCompleteModalOpen(false)} className="w-10 h-10 rounded-full flex items-center justify-center text-gray-400" aria-label="Close">
                  <i className="fas fa-times text-lg"></i>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto min-h-0 px-3 py-3 space-y-3">
                {completeError && (
                  <div className="bg-red-50 border border-red-200 text-[#ED2939] px-4 py-3 rounded-2xl text-sm font-medium">
                    <i className="fas fa-exclamation-circle mr-2"></i>{completeError}
                  </div>
                )}

                <div className="bg-white rounded-2xl p-2 shadow-sm">
                  {preDeliveryChecklist.map(item => {
                    const key = normalizeChecklistKey(item)
                    const checked = !!completeChecklist[key]
                    return (
                      <label
                        key={key}
                        className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition ${checked ? 'bg-green-50' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleCompleteToggle(key)}
                          className="h-6 w-6 text-[#002395] rounded-lg border-gray-300 focus:ring-[#002395] cursor-pointer shrink-0"
                        />
                        <span className={`text-sm font-medium flex-1 ${checked ? 'text-[#0f172a]' : 'text-gray-600'}`}>
                          {item}
                        </span>
                        {checked && <i className="fas fa-check-circle text-green-500"></i>}
                      </label>
                    )
                  })}
                </div>
              </div>

              <div className="flex-shrink-0 px-4 py-3 border-t border-gray-100 bg-white pb-safe space-y-2">
                <button
                  onClick={handleConfirmComplete}
                  disabled={ratingGenerating}
                  className="w-full bg-[#002395] text-white py-3.5 rounded-xl text-sm font-bold disabled:opacity-50"
                >
                  {ratingGenerating ? (
                    <span className="flex items-center justify-center gap-2">
                      <i className="fas fa-circle-notch animate-spin"></i> Completing...
                    </span>
                  ) : 'Complete Service'}
                </button>
                <button
                  onClick={() => setCompleteModalOpen(false)}
                  className="w-full border border-gray-200 text-gray-600 py-3 rounded-xl text-sm font-bold"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {showModal && (
          <ServiceOrderForm
            prefillData={prefillData}
            onSave={handleSaveOrder}
            onCancel={() => { setShowModal(false); setPrefillData(null); }}
          />
        )}

        {/* ── RATING LINK ── */}
        {ratingModalOpen && ratingDataForModal && (
          <div className="fixed z-50 inset-0 bg-black/60 flex items-end md:items-center justify-center animate-fade-in">
            <div className="fixed inset-0" onClick={handleSkipRating}></div>
            <div className="relative bg-white w-full md:max-w-md rounded-t-3xl md:rounded-2xl p-5 z-10 pb-safe">
              <h3 className="text-lg font-bold text-[#0f172a] mb-1">Send Rating Link</h3>
              <p className="text-gray-500 mb-3 text-sm">
                <strong className="text-[#0f172a]">{ratingDataForModal.customerName}</strong>
                {' · '}
                <a href={`tel:${ratingDataForModal.customerPhone}`} className="text-green-600 font-semibold">{ratingDataForModal.customerPhone}</a>
              </p>

              <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-4 text-sm text-gray-700 whitespace-pre-wrap break-words">
                Hi {ratingDataForModal.customerName}, your {ratingDataForModal.brand} {ratingDataForModal.model} service (₹{completedOrderForBill?.estimatedPrice || 0}) is completed at French Mobiles! 🎉<br/><br/>
                Please rate our service:<br/>
                https://{window.location.host}/rate/{ratingDataForModal.token}<br/><br/>
                Thank you for choosing French Mobiles! 🙏
              </div>

              <div className="space-y-2">
                <button onClick={handleSendRatingWhatsApp} className="w-full flex items-center justify-center gap-2 bg-green-600 text-white py-3.5 rounded-xl font-bold text-sm">
                  <i className="fab fa-whatsapp text-lg"></i> Send on WhatsApp
                </button>
                <button onClick={handleSkipRating} className="w-full border border-gray-200 text-gray-600 py-3 rounded-xl font-bold text-sm">
                  Skip
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── CREATE BILL ── */}
        {billModalOpen && completedOrderForBill && (
          <div className="fixed z-50 inset-0 bg-black/60 flex items-end md:items-center justify-center animate-fade-in">
            <div className="fixed inset-0" onClick={() => setBillModalOpen(false)}></div>
            <div className="relative bg-white w-full md:max-w-sm rounded-t-3xl md:rounded-2xl p-5 z-10 text-center pb-safe">
              <div className="w-14 h-14 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-3">
                <i className="fas fa-check text-xl"></i>
              </div>
              <h3 className="text-lg font-bold text-[#0f172a] mb-1">Service Completed</h3>
              <p className="text-gray-500 mb-4 text-sm">Create a bill for this service order?</p>
              <div className="space-y-2">
                <button onClick={() => handleCreateBill(null)} className="w-full bg-[#002395] text-white py-3.5 rounded-xl font-bold text-sm">
                  Create Bill
                </button>
                <button onClick={() => setBillModalOpen(false)} className="w-full border border-gray-200 text-gray-600 py-3 rounded-xl font-bold text-sm">
                  Later
                </button>
              </div>
            </div>
          </div>
        )}

        <NewSaleModal
          isOpen={newSaleModalOpen}
          onClose={() => setNewSaleModalOpen(false)}
          prefillData={salePrefillData}
          onSuccess={() => {
            fetchOrdersAndCustomers();
          }}
        />
        <ConfirmDeleteModal
          isOpen={!!deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          deleting={deleting}
          title="Delete Service Order"
          message={deleteWarning}
        />

        {/* ── WHATSAPP STATUS UPDATE ── */}
        {whatsAppDialog.open && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center animate-fade-in">
            <div className="bg-white w-full md:max-w-lg md:mx-auto rounded-t-3xl md:rounded-2xl flex flex-col max-h-[90dvh] overflow-hidden pb-safe">
              <div className="md:hidden flex justify-center pt-2.5 pb-1 flex-shrink-0">
                <div className="w-10 h-1 bg-gray-300 rounded-full"></div>
              </div>
              <div className="flex-shrink-0 px-4 pt-2 pb-3 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-[#0f172a]">Send WhatsApp Update</h2>
                  <p className="text-xs text-gray-400">
                    Status changed to <span className="font-bold text-[#002395]">{whatsAppDialog.newStatus}</span>
                  </p>
                </div>
                <button onClick={() => setWhatsAppDialog({ open: false })} className="w-10 h-10 rounded-full flex items-center justify-center text-gray-400" aria-label="Close">
                  <i className="fas fa-times text-lg"></i>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-gray-700 whitespace-pre-wrap">
                  {whatsAppDialog.message}
                </div>
                <a href={`tel:${whatsAppDialog.phone}`} className="text-xs text-green-600 font-semibold">
                  Sending to {whatsAppDialog.phone}
                </a>
              </div>
              <div className="flex-shrink-0 px-4 py-3 border-t border-gray-100 flex gap-2">
                <button
                  onClick={() => setWhatsAppDialog({ open: false })}
                  className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-3 text-sm font-bold"
                >
                  Skip
                </button>
                <a
                  href={`https://wa.me/91${whatsAppDialog.phone}?text=${encodeURIComponent(whatsAppDialog.message)}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setWhatsAppDialog({ open: false })}
                  className="flex-[2] bg-green-600 text-white rounded-xl py-3 text-sm font-bold flex items-center justify-center gap-2"
                >
                  <i className="fab fa-whatsapp text-lg"></i> Send
                </a>
              </div>
            </div>
          </div>
        )}

      </div>
    </Layout>
  );
};

export default ServiceOrderList;
