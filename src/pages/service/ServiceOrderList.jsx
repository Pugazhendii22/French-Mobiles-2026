import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, doc, updateDoc, query, where, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/shared/firebase/firebase';
import { useNavigate, useLocation } from 'react-router-dom';
import Layout from '@/shared/ui/Layout';
import ServiceOrderForm from './ServiceOrderForm';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { creditWallet } from '../../utils/walletUtils';
import NewSaleModal from '../../components/sales/NewSaleModal';
import ConfirmDeleteModal from '@/shared/ui/ConfirmDeleteModal';
import { nextDailyNumber } from '@/shared/data/counters';
import { loadCustomers, rememberCustomer } from '../../utils/customerCache';
import { SearchBar, CollapsibleFilter, EmptyState, ListSkeleton } from '@/shared/ui/ui';
import { describeFirebaseError } from '@/shared/firebase/firebaseError';
import { openWhatsApp as openWhatsAppChat, isWhatsAppReady, isSamePhone } from '@/shared/lib/phone';
import { useSheetDismiss } from '@/shared/ui/useSheetDismiss';
import { matchesQuery } from '@/shared/lib/searchMatch';
import { checklistEntries, blankChecklist, carryOver, allChecked } from '@/features/service/checklist';
import {
  STATUSES, isOverdue, isDueToday, isClosed, stateMetaOf, matchesTab, TABS, normalizeDate,
} from '@/features/service/orderState';
import { technicianNamesIn, matchesTechnician } from '@/features/service/technician';

const ServiceOrderList = () => {
  const { currentUser, userName, userRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  /* Arriving from the scanner carries the scanned device in router state.
     Seeded at mount so the prefilled form is open on the first render rather
     than flashing the list first. */
  const [prefillData, setPrefillData] = useState(() => location.state || null);

  /* These short dialogs have no grab handle, so no handle is added: the whole
     dialog answers a downward swipe instead. They have nothing to scroll, so
     the gesture cannot be confused with scrolling. */
  const { sheetProps: billSheet } = useSheetDismiss({ onDismiss: () => setBillModalOpen(false) });
  /* Wrapped, not passed bare. `handleSkipRating` is a const declared further
     down this component, so naming it here evaluates it during render - before
     it exists - and the page dies with "Cannot access 'handleSkipRating' before
     initialization". The arrow defers the lookup to the moment the sheet is
     actually dismissed. */
  const { sheetProps: ratingSheet } = useSheetDismiss({ onDismiss: () => handleSkipRating() });
  const { sheetProps: doneSheet, handleProps: doneHandle, scrollRef: doneScroll } = useSheetDismiss({ onDismiss: () => setCompleteModalOpen(false) });
  const { sheetProps: waSheet, handleProps: waHandle, scrollRef: waScroll } = useSheetDismiss({ onDismiss: () => setWhatsAppDialog({ open: false }) });
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  /* Opens on the work still in the shop. That is the reason anyone comes to
     this page; finished orders are history, one tap away. */
  const [tab, setTab] = useState('Open');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [technicianFilter, setTechnicianFilter] = useState('');
  const [showModal, setShowModal] = useState(() => !!location.state);

  const { preDeliveryChecklist = [] } = useSettings();
  const [completeModalOpen, setCompleteModalOpen] = useState(false);
  const [selectedOrderForComplete, setSelectedOrderForComplete] = useState(null);
  const [completeChecklist, setCompleteChecklist] = useState(() => blankChecklist(preDeliveryChecklist));
  const [completeError, setCompleteError] = useState('');

  /* The list is editable in settings, so it can change while this sheet is
     open. Whatever was already ticked stays ticked. */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCompleteChecklist(prev => carryOver(preDeliveryChecklist, prev));
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
  const [loadError, setLoadError] = useState('');


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
      setLoadError(describeFirebaseError(err));
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

  /* Returns the order number as well as the id. The form has no way to work out
     the number for itself - it is drawn from the daily counter here - and
     without it back in hand the form thought the order still had none. Saving a
     second time from the same open form then minted a fresh number and
     overwrote the first, so an order could be renumbered under a label that had
     already been printed with the old one. */
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

    /* Compared on the normalised number rather than the exact string. A phone
       typed "98765 43210" against a stored "9876543210" is the same customer, and
       an exact match filed a second record for them every time. */
    if (!customers.some(c => isSamePhone(c.phone, data.customerPhone))) {
      const now = new Date().toISOString();
      const record = {
        name: data.customerName,
        phone: data.customerPhone,
        createdAt: now,
        updatedAt: now
      };
      const ref = await addDoc(collection(db, 'customers'), record);
      rememberCustomer({ id: ref.id, ...record });
    }

    if (data.id) {
      const { id, ...updateData } = newOrder;
      await import('firebase/firestore').then(m => m.updateDoc(m.doc(db, 'service_orders', id), updateData));
      fetchOrdersAndCustomers();
      return { id, orderNumber };
    }

    newOrder.createdAt = new Date().toISOString();
    const docRef = await addDoc(collection(db, 'service_orders'), newOrder);
    fetchOrdersAndCustomers();
    return { id: docRef.id, orderNumber };
  };

  const openCompleteModal = (order) => {
    setSelectedOrderForComplete(order);
    setCompleteChecklist(blankChecklist(preDeliveryChecklist));
    setCompleteError('');
    setCompleteModalOpen(true);
  };

  const handleCompleteToggle = (key) => {
    setCompleteChecklist(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleConfirmComplete = async () => {
    if (!allChecked(preDeliveryChecklist, completeChecklist)) {
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
      setOrders(prev => prev.map(o => o.id === selectedOrderForComplete.id ? finalOrder : o));
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
      openWhatsAppChat(ratingDataForModal.customerPhone, message);
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
    const message = `Hi ${order.customerName}, regarding your service order ${order.orderNumber} for ${order.brand} ${order.model}. - French Mobiles`;
    openWhatsAppChat(order.customerPhone || order.alternatePhone, message);
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
      /* An ISO string, as every other write to this collection uses. This was a
         Date, which Firestore stores as a Timestamp - so service_orders.updatedAt
         held one of two types depending on which screen last touched it, and
         anything sorting or parsing it would have had to handle both. */
      const updateData = { status: newStatus, updatedAt: new Date().toISOString() }
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

  /* One clock for the whole render, so a row cannot be drawn as overdue while
     the count beside it was taken a millisecond earlier. */
  const now = new Date();
  const overdueCount = orders.filter(o => isOverdue(o, now)).length;
  const dueTodayCount = orders.filter(o => isDueToday(o, now)).length;
  const openCount = orders.filter(o => !isClosed(o.status)).length;

  const filteredOrders = orders.filter(o => {
    /* Searching the device as well as the person: a customer who has left two
       phones in is found by either of them, and an IMEI read off the back of a
       handset finds the order without anyone remembering the name. */
    const matchesSearch = matchesQuery(searchQuery, [
      o.customerName, o.customerPhone, o.alternatePhone,
      o.orderNumber, o.brand, o.model, o.imei1, o.imei2, o.serialNumber,
    ]);

    /* Both ends read as local time. `new Date('2026-10-06')` is parsed as UTC
       midnight while `new Date('2026-10-06T23:59:59')` is parsed as local, so
       From and To were anchored five and a half hours apart here and From = To =
       today quietly dropped the start of the day. */
    const orderDate = o.createdAt ? new Date(o.createdAt) : null;
    const matchesFrom = !fromDate || (orderDate && orderDate >= new Date(fromDate + 'T00:00:00'));
    const matchesTo = !toDate || (orderDate && orderDate <= new Date(toDate + 'T23:59:59'));

    return matchesSearch && matchesTab(o, tab, now) && matchesFrom && matchesTo
      && matchesTechnician(o, technicianFilter);
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
  const filterActive = dateFilterActive || Boolean(technicianFilter);
  /* Staff only ever load their own orders, so the choice is only worth offering
     when there is more than one name on the list. */
  const technicianNames = technicianNamesIn(orders);

  /* Only the tabs that answer "how much is waiting on me" carry a count. A
     number beside every status would be eight numbers to read past. */
  const tabCount = { Open: openCount, 'Due Today': dueTodayCount, Overdue: overdueCount };

  return (
    <Layout title="Service Orders" pageType="list" fab={fab}>
      <div className="max-w-3xl mx-auto space-y-3">

        {loadError && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
            <p className="text-sm font-bold text-[#ED2939]">
              <i className="fas fa-exclamation-circle mr-2"></i>Could not load service orders
            </p>
            <p className="text-xs text-[#7a1520] mt-1 leading-relaxed">{loadError}</p>
          </div>
        )}

        <SearchBar
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onClear={() => setSearchQuery('')}
          placeholder="Search name, phone, order no., device or IMEI"
        />

        {/* ── STATUS TABS ── */}
        <div className="flex overflow-x-auto hide-scrollbar gap-2 -mx-4 px-4 py-0.5" role="tablist">
          {TABS.map(t => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`whitespace-nowrap px-4 py-2 rounded-xl text-sm font-semibold shrink-0 transition ${
                tab === t
                  ? 'bg-[#002395] text-white shadow-sm'
                  : 'bg-white border border-[#e2e8f0] text-[#64748b]'
              }`}
            >
              {t}
              {tabCount[t] > 0 && (
                <span className={`ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  tab === t
                    ? 'bg-white/25 text-white'
                    : t === 'Overdue' ? 'bg-[#ED2939] text-white'
                      : t === 'Due Today' ? 'bg-orange-500 text-white'
                        : 'bg-[#eef2f8] text-[#64748b]'
                }`}>
                  {tabCount[t]}
                </span>
              )}
            </button>
          ))}
        </div>

        <CollapsibleFilter
          open={showFilters}
          onToggle={() => setShowFilters(prev => !prev)}
          active={filterActive}
          label="Filter by date or technician"
        >
          {technicianNames.length > 1 && (
            <div>
              <label htmlFor="technician-filter" className="block text-xs text-gray-500 mb-1">Technician</label>
              <select
                id="technician-filter"
                value={technicianFilter}
                onChange={e => setTechnicianFilter(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#002395]"
              >
                <option value="">All technicians</option>
                {technicianNames.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
          )}
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
            onClick={() => { setFromDate(''); setToDate(''); setTechnicianFilter(''); }}
            className="w-full text-sm font-semibold text-[#ED2939] bg-[#ED2939]/10 py-2.5 rounded-xl"
          >
            Clear filters
          </button>
        </CollapsibleFilter>

        {!loading && (
          <p className="text-xs text-gray-400 px-1">
            {filteredOrders.length} of {orders.length} {orders.length === 1 ? 'order' : 'orders'}
          </p>
        )}

        {/* ── THE JOB SHEET ──
            A row per order, kept to the height of what it has to say, so a
            shop with eighty open repairs reads as one list you can run a thumb
            down rather than eighty cards you have to scroll past.

            The spine down the left says what you have to do about it: red is
            past the time the customer was given, blue is in the shop, grey is
            handed back. Nothing is colour alone - an overdue row says so in
            words beside the order number. */}
        {loading ? (
          <ListSkeleton count={5} height="h-20" />
        ) : filteredOrders.length === 0 ? (
          <EmptyState
            icon="fa-clipboard-list"
            title={tab === 'Open' ? 'Nothing in the shop' : 'No orders here'}
            hint={tab === 'Open'
              ? 'Everything has been handed back. Tap All to look one up.'
              : 'Try a different tab, a shorter search, a wider date range or another technician.'}
          />
        ) : (
          <div className="bg-white border border-[#E6EAF0] rounded-xl overflow-hidden">
            {filteredOrders.map(order => {
              const meta = stateMetaOf(order, now);
              const late = meta.key === 'overdue';
              const done = isClosed(order.status);
              const phone = order.customerPhone || order.alternatePhone;
              const due = normalizeDate(order.expectedCompletionAt);

              return (
                <div
                  key={order.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/service/${order.id}`)}
                  onKeyDown={e => { if (e.key === 'Enter') navigate(`/service/${order.id}`); }}
                  className="relative flex gap-3 pl-4 pr-3 py-2.5 border-b border-[#F1F4F9] last:border-0 cursor-pointer active:bg-[#F8FAFC] focus:outline-none focus:bg-[#F1F4F9]"
                >
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-0 bottom-0 w-[3px]"
                    style={{ background: meta.spine }}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[11px] font-bold text-[#002395] font-mono shrink-0">
                          {order.orderNumber}
                        </span>
                        {late && (
                          <span className="text-[10px] font-bold text-[#ED2939] shrink-0">
                            Overdue{due ? ` · due ${due.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
                          </span>
                        )}
                        {done && (
                          <span className="text-[10px] font-semibold text-[#94a3b8] shrink-0">{meta.label}</span>
                        )}
                      </div>
                      {order.estimatedPrice > 0 && (
                        <span className={`text-[15px] font-bold tabular-nums shrink-0 ${done ? 'text-[#94a3b8]' : 'text-[#0F172A]'}`}>
                          ₹{Number(order.estimatedPrice).toLocaleString('en-IN')}
                        </span>
                      )}
                    </div>

                    <p className={`text-[15px] font-semibold leading-tight truncate mt-0.5 ${done ? 'text-[#94a3b8]' : 'text-[#0F172A]'}`}>
                      {order.customerName}
                    </p>

                    <p className="text-[12px] text-[#64748B] leading-tight mt-0.5 truncate">
                      {[`${order.brand || ''} ${order.model || ''}`.trim(), phone].filter(Boolean).join(' · ')}
                    </p>

                    {/* Status is the field staff change most, so it stays a
                        direct control - but only while the order is still
                        live. A finished order has nothing left to set. */}
                    {!done && (
                      <div className="flex items-center gap-2 mt-2">
                        <select
                          value={order.status}
                          onChange={e => handleQuickStatusChange(order, e.target.value)}
                          onClick={e => e.stopPropagation()}
                          onMouseDown={e => e.stopPropagation()}
                          aria-label={`Status of ${order.orderNumber}`}
                          className={`flex-1 min-w-0 text-[12px] font-bold px-2.5 py-1.5 rounded-lg border-0 focus:outline-none ${getStatusColor(order.status)}`}
                        >
                          {STATUSES.filter(st => st !== 'Completed').map(st => (
                            <option key={st} value={st}>{st}</option>
                          ))}
                        </select>

                        <button
                          onClick={e => { e.stopPropagation(); openCompleteModal(order); }}
                          className="shrink-0 bg-[#002395] text-white text-[12px] font-semibold px-3 py-1.5 rounded-lg"
                        >
                          Complete
                        </button>

                        {phone && isWhatsAppReady(phone) && (
                          <button
                            onClick={e => { e.stopPropagation(); openWhatsApp(order); }}
                            className="shrink-0 w-8 h-8 rounded-lg text-[#16a34a] flex items-center justify-center active:bg-green-50"
                            aria-label={`Message ${order.customerName} on WhatsApp`}
                          >
                            <i className="fab fa-whatsapp text-base" aria-hidden="true"></i>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {userRole === 'admin' && (
                    <button
                      onClick={e => { e.stopPropagation(); handleDeleteClick(order); }}
                      className="shrink-0 w-8 h-8 -mr-1 self-start rounded-lg text-[#cbd5e1] flex items-center justify-center active:text-[#ED2939]"
                      aria-label={`Delete ${order.orderNumber}`}
                    >
                      <i className="fas fa-trash text-[11px]" aria-hidden="true"></i>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── PRE-DELIVERY CHECKLIST SHEET ── */}
        {completeModalOpen && selectedOrderForComplete && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center animate-fade-in">
            <div {...doneSheet} className="bg-[#f1f5f9] w-full md:max-w-md md:mx-auto rounded-t-3xl md:rounded-2xl flex flex-col h-[90dvh] md:h-auto md:max-h-[90vh] overflow-hidden">
              <div {...doneHandle} aria-label="Drag down to close" className="md:hidden flex justify-center pt-2.5 pb-1 bg-white">
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

              <div ref={doneScroll} className="flex-1 overflow-y-auto min-h-0 px-3 py-3 space-y-3">
                {completeError && (
                  <div className="bg-red-50 border border-red-200 text-[#ED2939] px-4 py-3 rounded-2xl text-sm font-medium">
                    <i className="fas fa-exclamation-circle mr-2"></i>{completeError}
                  </div>
                )}

                <div className="bg-white rounded-2xl p-2 shadow-sm space-y-2">
                  {/* A row is 60px tall with a gap between rows, because these
                      were 48px targets touching each other: a thumb aimed at one
                      landed on its neighbour and unticked it, and the only way
                      through the list was to tap very carefully. */}
                  {checklistEntries(preDeliveryChecklist).map(({ item, key }) => {
                    const checked = !!completeChecklist[key]
                    return (
                      <label
                        key={key}
                        className={`flex items-center gap-3 px-3 min-h-[60px] rounded-xl cursor-pointer transition border ${
                          checked
                            ? 'bg-green-50 border-green-200'
                            : 'bg-white border-[#e2e8f0]'
                        }`}
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
                        {checked && <i className="fas fa-check-circle text-green-500" aria-hidden="true"></i>}
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
            <div {...ratingSheet} className="relative bg-white w-full md:max-w-md rounded-t-3xl md:rounded-2xl p-5 z-10 pb-safe">
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
            <div {...billSheet} className="relative bg-white w-full md:max-w-sm rounded-t-3xl md:rounded-2xl p-5 z-10 text-center pb-safe">
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
            <div {...waSheet} className="bg-white w-full md:max-w-lg md:mx-auto rounded-t-3xl md:rounded-2xl flex flex-col max-h-[90dvh] overflow-hidden pb-safe">
              <div {...waHandle} aria-label="Drag down to close" className="md:hidden flex justify-center pt-2.5 pb-1 flex-shrink-0">
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
              <div ref={waScroll} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-gray-700 whitespace-pre-wrap">
                  {whatsAppDialog.message}
                </div>
                <a href={`tel:${whatsAppDialog.phone}`} className="text-xs text-green-600 font-semibold">
                  Sending to {whatsAppDialog.phone}
                </a>
                {!isWhatsAppReady(whatsAppDialog.phone) && (
                  <p className="text-xs text-[#ED2939] font-semibold">
                    <i className="fas fa-triangle-exclamation mr-1"></i>
                    WhatsApp will not accept this number. Edit the order and save a valid 10-digit mobile number.
                  </p>
                )}
              </div>
              <div className="flex-shrink-0 px-4 py-3 border-t border-gray-100 flex gap-2">
                <button
                  onClick={() => setWhatsAppDialog({ open: false })}
                  className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-3 text-sm font-bold"
                >
                  Skip
                </button>
                <button
                  onClick={() => {
                    if (openWhatsAppChat(whatsAppDialog.phone, whatsAppDialog.message)) {
                      setWhatsAppDialog({ open: false });
                    }
                  }}
                  className="flex-[2] bg-green-600 text-white rounded-xl py-3 text-sm font-bold flex items-center justify-center gap-2"
                >
                  <i className="fab fa-whatsapp text-lg"></i> Send
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </Layout>
  );
};

export default ServiceOrderList;
