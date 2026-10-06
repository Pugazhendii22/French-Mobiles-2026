import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, collection, addDoc, query, where, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '@/shared/firebase/firebase';
import ServiceOrderForm from './ServiceOrderForm';
import { getLabelNumber } from '@/features/labels/data';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import NewSaleModal from '../../components/sales/NewSaleModal';
import { generateLabelHTML } from '@/features/labels/printing/printLabel';
import { creditWallet } from '../../utils/walletUtils';
import { generateServiceJobCard } from '../../utils/generateServiceJobCard';
import { generateServiceFinalBill } from '../../utils/generateServiceFinalBill';
import PrinterSelector from '@/features/labels/printing/PrinterSelector';
import ImageModal from '@/shared/ui/ImageModal';
import Layout from '@/shared/ui/Layout';
import { Section, InfoRow, InfoGrid, Chip } from '@/shared/ui/ui';
import ConfirmDeleteModal from '@/shared/ui/ConfirmDeleteModal';
import { imageThumb } from '@/shared/lib/imageUrl';
import { describeFirebaseError } from '@/shared/firebase/firebaseError';
import { openWhatsApp as openWhatsAppChat } from '@/shared/lib/phone';
import { serviceOrderLabelData, syncLabelSnapshot, withLiveLabelData } from '@/features/labels/data';
import { useSheetDismiss } from '@/shared/ui/useSheetDismiss';
import { isOverdue, stateMetaOf, statusOptionsFor } from '@/features/service/orderState';
import { checklistEntries, blankChecklist, allChecked } from '@/features/service/checklist';

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const ServiceOrderView = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { userRole, currentUser, userName } = useAuth();
  const { shopDetails, preDeliveryChecklist = [] } = useSettings();
  const [order, setOrder] = useState(null);

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
  const { sheetProps: doneSheet, handleProps: doneHandle, scrollRef: doneScroll } = useSheetDismiss({ onDismiss: () => setShowCompleteModal(false) });
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [labelEntry, setLabelEntry] = useState(null);
  const [showLabelDialog, setShowLabelDialog] = useState(false);
  const [labelInput, setLabelInput] = useState('');
  const [assigningLabel, setAssigningLabel] = useState(false);
  const [newSaleModalOpen, setNewSaleModalOpen] = useState(false);
  const [salePrefillData, setSalePrefillData] = useState(null);
  const [generatingRating, setGeneratingRating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [showPrinter, setShowPrinter] = useState(false);
  const [labelHTML, setLabelHTML] = useState('');
  const [showDeviceImage, setShowDeviceImage] = useState(false);
  const [showLockCode, setShowLockCode] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerUrl, setViewerUrl] = useState('');
  const [viewerTitle, setViewerTitle] = useState('');

  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completeChecklist, setCompleteChecklist] = useState({});
  const [completeError, setCompleteError] = useState('');

  const [billModalOpen, setBillModalOpen] = useState(false);
  const [completedOrderForBill, setCompletedOrderForBill] = useState(null);
  const [ratingModalOpen, setRatingModalOpen] = useState(false);
  const [ratingDataForModal, setRatingDataForModal] = useState(null);
  const [ratingGenerating, setRatingGenerating] = useState(false);

  /* Blanked when the sheet opens, and only then. The settings list was in the
     dependencies, and the context hands out a fresh array whenever no checklist
     is configured - so this could fire mid-tick and wipe what had been ticked.
     An item added to settings while the sheet is open simply renders unticked,
     which is what it should be. */
  useEffect(() => {
    if (!showCompleteModal) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCompleteChecklist(blankChecklist(preDeliveryChecklist));
    setCompleteError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCompleteModal]);

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

      await updateDoc(doc(db, 'service_orders', id), updateData);

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
      
      const finalOrder = { ...order, ...updateData };
      setOrder(finalOrder);
      setShowCompleteModal(false);

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
      const message = `Hi ${ratingDataForModal.customerName}, your ${ratingDataForModal.brand} ${ratingDataForModal.model} service (₹${completedOrderForBill?.estimatedPrice || order?.estimatedPrice || 0}) is completed at French Mobiles! 🎉\n\nPlease rate our service:\nhttps://${window.location.host}/rate/${ratingDataForModal.token}\n\nThank you for choosing French Mobiles! 🙏`;
      openWhatsAppChat(ratingDataForModal.customerPhone, message);
    }
    setRatingModalOpen(false);
    setBillModalOpen(true);
  };

  const handleSkipRating = () => {
    setRatingModalOpen(false);
    setBillModalOpen(true);
  };

  const fetchOrder = useCallback(async () => {
    try {
      const docSnap = await getDoc(doc(db, 'service_orders', id));
      if (docSnap.exists()) setOrder({ id: docSnap.id, ...docSnap.data() });
    } catch (err) {
      console.error(err);
    }
  }, [id]);

  const fetchLabel = useCallback(async () => {
    try {
      const snap = await getDocs(query(
        collection(db, 'label_registry'),
        where('referenceId', '==', id),
        where('labelType', '==', 'service_order')
      ));
      if (!snap.empty) setLabelEntry(snap.docs[0].data());
    } catch (err) {
      console.error(err);
    }
  }, [id]);

  useEffect(() => {
    const loadData = async () => {
      try {
        await fetchOrder();
        await fetchLabel();
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [fetchOrder, fetchLabel]);


  const handleUpdate = async (data) => {
    if ((order?.status === 'Completed' || order?.billCreated) && userRole?.toLowerCase() !== 'admin') {
      alert('Only admin can make changes to completed bills.');
      return;
    }
    const updated = { ...data, updatedAt: new Date().toISOString() };
    await updateDoc(doc(db, 'service_orders', id), updated);
    setOrder({ id, ...updated });
    // The label keeps its own copy of the estimate - refresh it, or a reprint
    // shows the amount this edit just replaced.
    const liveData = serviceOrderLabelData(updated);
    await syncLabelSnapshot('service_order', id, liveData);
    setLabelEntry(prev => withLiveLabelData(prev, liveData));
    return id;
  };

  const handleStatusChange = async (e) => {
    const newStatus = e.target.value;
    const admin = userRole?.toLowerCase() === 'admin';
    if ((order?.status === 'Completed' || order?.billCreated) && !admin) {
      alert('Only admin can make changes to completed bills.');
      return;
    }
    /* The same rule canChangeStatus uses to decide whether to draw the select at
       all. It was only in the markup, so the two could drift - and this page is
       reachable by link and by scanning a label, not just from the list that
       filters to your own orders. The list's quick-change has carried this check
       all along; this one did not. */
    if (!admin && order?.technicianUid !== currentUser?.uid) {
      alert('You can only change the status of orders assigned to you.');
      return;
    }
    setUpdatingStatus(true);
    try {
      const updatePayload = { status: newStatus, updatedAt: new Date().toISOString() };
      await updateDoc(doc(db, 'service_orders', id), updatePayload);
      setOrder(prev => ({ ...prev, ...updatePayload }));
    } catch (err) { console.error(err); } finally { setUpdatingStatus(false); }
  };

  const openWhatsApp = () => {
    const msg = `Hi ${order.customerName}, your ${order.brand} ${order.model} (Order: ${order.orderNumber}) is ready for pickup. Amount: ₹${order.estimatedPrice}. - French Mobiles`;
    openWhatsAppChat(order.customerPhone || order.alternatePhone, msg);
  };

  const handlePrintDocument = (htmlContent) => {
    const printWindow = window.open('', '_blank')
    printWindow.document.write(htmlContent)
    printWindow.document.close()
    setTimeout(() => {
      printWindow.print()
    }, 500)
  }

  const handlePrintJobCard = () => {
    const html = generateServiceJobCard(order, shopDetails)
    handlePrintDocument(html)
  }

  const handlePrintFinalBill = () => {
    const html = generateServiceFinalBill(order, shopDetails)
    handlePrintDocument(html)
  }

  const handleCreateBill = () => {
    const o = completedOrderForBill || order;
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

  const handleSendRating = async () => {
    setGeneratingRating(true);
    try {
      const token = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2);

      const ratingData = {
        token: token,
        serviceOrderId: id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        brand: order.brand,
        model: order.model,
        technicianName: order.technicianName || '',
        rating: null,
        comment: null,
        status: 'pending',
        createdAt: new Date().toISOString(),
        submittedAt: null,
        isUsed: false
      };

      await setDoc(doc(db, 'ratings', token), ratingData);
      await updateDoc(doc(db, 'service_orders', id), { ratingToken: token });
      setOrder(prev => ({ ...prev, ratingToken: token }));

      const message = `Hi ${order.customerName}, your ${order.brand} ${order.model} service (₹${order.estimatedPrice}) is completed at French Mobiles! 🎉\n\nPlease take a moment to rate our service:\nhttps://${window.location.host}/rate/${token}\n\nThank you for choosing French Mobiles! 🙏`;
      openWhatsAppChat(order.customerPhone || order.alternatePhone, message);

    } catch (e) {
      console.error("Error generating rating link:", e);
      alert("Failed to generate rating link.");
    }
    setGeneratingRating(false);
  };

  const openLabelDialog = async () => {
    const next = await getLabelNumber();
    setLabelInput(String(next));
    setShowLabelDialog(true);
  };

  const confirmAssign = async () => {
    setAssigningLabel(true);
    try {
      const labelData = {
        labelNumber: Number(labelInput),
        labelType: 'service_order',
        referenceId: id,
        assignedBy: auth.currentUser?.uid || 'unknown',
        assignedAt: new Date().toISOString(),
        isActive: true,
        data: {
          ...serviceOrderLabelData(order),
          createdBy: order.createdBy || '', createdAt: order.createdAt || '',
        }
      };
      await addDoc(collection(db, 'label_registry'), labelData);
      setLabelEntry(labelData);
      setShowLabelDialog(false);
    } catch (err) { console.error(err); alert('Failed to assign label.'); }
    finally { setAssigningLabel(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    
    setDeleting(true);
    try {
      // Delete the service order document
      await deleteDoc(doc(db, 'service_orders', deleteTarget.id));
      
      // If there's a linked sale, we might want to handle it, but for now just delete the order
      // If there's a rating token, delete the rating document too
      if (deleteTarget.ratingToken) {
        try {
          await deleteDoc(doc(db, 'ratings', deleteTarget.ratingToken));
        } catch (ratingErr) {
          console.error('Error deleting rating:', ratingErr);
          // Don't fail the whole operation if rating deletion fails
        }
      }
      
      // If there's a label assigned, mark it as inactive
      if (labelEntry) {
        try {
          const labelQuery = query(
            collection(db, 'label_registry'),
            where('referenceId', '==', deleteTarget.id),
            where('labelType', '==', 'service_order')
          );
          const labelSnap = await getDocs(labelQuery);
          if (!labelSnap.empty) {
            await updateDoc(labelSnap.docs[0].ref, { isActive: false });
          }
        } catch (labelErr) {
          console.error('Error deactivating label:', labelErr);
          // Don't fail the whole operation if label deactivation fails
        }
      }
      
      // Navigate back to service list
      navigate('/service');
    } catch (err) {
      console.error('Error deleting service order:', err);
      alert('Failed to delete service order. Please try again.');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  useEffect(() => {
    if (order && userRole?.toLowerCase() === 'staff' && order.technicianUid !== currentUser?.uid) {
      alert("You are not authorized to view this order");
      navigate('/service', { replace: true });
    }
  }, [order, userRole, currentUser, navigate]);

  if (loading) return <div className="p-4 md:p-8 text-center">Loading...</div>;
  if (!order) return <div className="p-4 md:p-8 text-center text-red-600">Order not found</div>;

  if (order && userRole?.toLowerCase() === 'staff' && order.technicianUid !== currentUser?.uid) {
    return null;
  }

  const expectedCompletionDate = order.expectedCompletionAt ? (order.expectedCompletionAt.toDate ? order.expectedCompletionAt.toDate() : new Date(order.expectedCompletionAt)) : null;
  const isCompleted = order.status === 'Completed';
  const isCompletedBill = isCompleted || Boolean(order?.billCreated);
  const isAdmin = userRole?.toLowerCase() === 'admin';
  /* From orderState, not worked out again here. The local version tested
     !isCompleted where the list tests isClosed - so a Returned order past its
     date showed an Overdue badge on this page while the list called it Finished.
     orderState exists to stop the two screens disagreeing: closed beats overdue,
     because a job already handed back is not an alarm. */
  const overdue = isOverdue(order);
  /* Both print routes (browser HTML and print-to-shop-PC) must read the order
     as it is now, not the copy stored when the label was assigned. */
  const labelEntryLive = withLiveLabelData(labelEntry, serviceOrderLabelData(order));

  const canChangeStatus = isAdmin || (
    userRole?.toLowerCase() === 'staff' &&
    order?.technicianUid === currentUser?.uid &&
    !isCompletedBill &&
    order?.status !== 'Returned'
  );

  const statusColors = order?.status === 'Completed' ? 'bg-green-100 text-green-700' :
    order?.status === 'In Progress' ? 'bg-yellow-100 text-yellow-700' :
    order?.status === 'Parts Awaiting' ? 'bg-orange-100 text-orange-700' :
    order?.status === 'Returned' ? 'bg-red-100 text-[#ED2939]' :
    order?.status === 'Awaiting Customer Approval' ? 'bg-purple-100 text-purple-700' :
    'bg-blue-100 text-blue-700';

  /* statusOptionsFor states the rule; this used to slice STATUSES at the
     current status's index, which read array position as a workflow. See the
     note beside it in orderState. */
  const filteredStatusOptions = statusOptionsFor(order?.status, { isAdmin });

  const showStatusSelect = canChangeStatus && order?.status !== 'Completed';

  /* The same three-state colour the job sheet uses, so the spine down the left
     of this page means what it meant in the list you arrived from. */
  const heroState = stateMetaOf(order);

  const balanceDue = Math.max(
    0,
    (Number(order?.estimatedPrice) || 0) - (Number(order?.advancePaid) || 0),
  );

  /* Named once. Each was spelled out inline at its own button, slightly
     differently each time. */
  const canComplete = (isAdmin || order?.technicianUid === currentUser?.uid) && !isCompleted;
  const canEditOrder = isAdmin || (order?.technicianUid === currentUser?.uid && !isCompletedBill);

    return (
      <Layout title="Service Order" pageType="detail" backTo="/service">
        <div className="max-w-3xl mx-auto space-y-3">

          {/* ── HERO ──
              What someone needs before they do anything: who it is, what came
              in, whether it is late, and what the money is. Then one thing to
              do, and quieter ways to do the rest.

              This was up to nine filled buttons in eight colours - blue, green,
              blue-tint, amber, red, grey, emerald, yellow, purple - stacked
              under the status. Every one of them shouted equally, so none of
              them read as the thing you came here for. They are all still here;
              only one of them is loud. */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">

            <div className="relative p-4">
              <span
                aria-hidden="true"
                className="absolute left-0 top-0 bottom-0 w-[3px]"
                style={{ background: heroState.spine }}
              />

              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-bold text-[#002395] font-mono">{order?.orderNumber}</span>
                    {overdue && (
                      <span className="text-[10px] font-bold text-[#ED2939]">
                        Overdue{expectedCompletionDate ? ` · due ${expectedCompletionDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
                      </span>
                    )}
                    {isCompleted && (
                      <span className="text-[10px] font-semibold text-[#94a3b8]">Finished</span>
                    )}
                  </div>

                  <h2 className="text-lg font-bold text-[#0f172a] mt-0.5 leading-tight truncate">{order?.customerName}</h2>

                  <div className="flex items-center gap-3 flex-wrap mt-1">
                    {order?.customerPhone && (
                      <a href={`tel:${order.customerPhone}`} className="inline-flex items-center gap-1.5 text-green-600 font-semibold text-sm">
                        <i className="fas fa-phone text-xs" aria-hidden="true"></i>{order.customerPhone}
                      </a>
                    )}
                    {order?.alternatePhone && (
                      <a href={`tel:${order.alternatePhone}`} className="inline-flex items-center gap-1.5 text-green-600 font-semibold text-sm">
                        <i className="fas fa-phone text-xs" aria-hidden="true"></i>{order.alternatePhone}
                      </a>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                <Chip className="bg-gray-100 text-gray-700">{order?.brand} {order?.model}</Chip>
                {order?.colour && <Chip>{order?.colour}</Chip>}
                {labelEntry && (
                  <Chip className="bg-[#002395]/10 text-[#002395]"><i className="fas fa-tag mr-1" aria-hidden="true"></i>#{labelEntry.labelNumber}</Chip>
                )}
              </div>
            </div>

            {/* The three figures the customer asks about, in the order they ask:
                what it costs, what they have already handed over, what is left. */}
            <div className="flex items-stretch border-t border-[#f1f4f9] divide-x divide-[#f1f4f9] px-4">
              <div className="flex-1 py-3">
                <p className="text-[11px] text-[#64748b]">Estimate</p>
                <p className="text-[15px] font-bold tabular-nums text-[#0f172a] mt-0.5">{money(order?.estimatedPrice)}</p>
              </div>
              <div className="flex-1 py-3 pl-3">
                <p className="text-[11px] text-[#64748b]">Advance paid</p>
                <p className="text-[15px] font-bold tabular-nums text-green-700 mt-0.5">{money(order?.advancePaid)}</p>
              </div>
              <div className="flex-1 py-3 pl-3">
                <p className="text-[11px] text-[#64748b]">Balance</p>
                <p className="text-[15px] font-bold tabular-nums text-[#0f172a] mt-0.5">{money(balanceDue)}</p>
              </div>
            </div>

            {/* Status is the thing that changes most, so it gets its own control */}
            <div className="px-4 py-3 border-t border-[#f1f4f9]">
              {showStatusSelect ? (
                <select
                  value={order?.status}
                  onChange={handleStatusChange}
                  disabled={updatingStatus}
                  aria-label="Order status"
                  className={`w-full text-sm px-3 py-3 rounded-xl border-0 font-bold focus:outline-none ${statusColors}`}
                >
                  {filteredStatusOptions.map(status => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              ) : (
                <p className={`w-full text-center text-sm px-3 py-3 rounded-xl font-bold ${statusColors}`}>
                  {order?.status}
                </p>
              )}
            </div>

            <div className="px-4 py-3 border-t border-[#f1f4f9]">
              {/* The one thing this page is for, which depends on where the
                  order has got to: finish the repair, then bill it. */}
              {canComplete && (
                <button
                  onClick={() => setShowCompleteModal(true)}
                  disabled={updatingStatus}
                  className="w-full bg-[#002395] text-white py-3 rounded-xl text-[15px] font-bold disabled:opacity-50"
                >
                  Complete this service
                </button>
              )}

              {isCompleted && !order?.billCreated && (
                <button
                  onClick={handleCreateBill}
                  className="w-full bg-[#16a34a] text-white py-3 rounded-xl text-[15px] font-bold"
                >
                  Create the bill
                </button>
              )}

              {/* Everything else, in one quiet block. Nothing here competes
                  with the button above, and nothing has been taken away. */}
              <div className={`flex flex-wrap items-center justify-center gap-x-4 gap-y-1 ${(canComplete || (isCompleted && !order?.billCreated)) ? 'mt-3' : ''}`}>
                {canEditOrder && (
                  <button onClick={() => setShowEdit(true)} className="text-[13px] font-semibold text-[#002395] py-1.5">
                    Edit details
                  </button>
                )}

                <button onClick={handlePrintJobCard} className="text-[13px] font-semibold text-[#002395] py-1.5">
                  Print job card
                </button>

                {labelEntry ? (
                  <button
                    onClick={() => {
                      const html = generateLabelHTML(labelEntryLive)
                      setLabelHTML(html)
                      setShowPrinter(true)
                    }}
                    className="text-[13px] font-semibold text-[#002395] py-1.5"
                  >
                    Print label #{labelEntry.labelNumber}
                  </button>
                ) : (
                  <button onClick={openLabelDialog} className="text-[13px] font-semibold text-[#002395] py-1.5">
                    Assign a label
                  </button>
                )}

                {isCompleted && (
                  <button onClick={handlePrintFinalBill} className="text-[13px] font-semibold text-[#002395] py-1.5">
                    Print final bill
                  </button>
                )}

                {isCompleted && (
                  <button onClick={openWhatsApp} className="text-[13px] font-semibold text-[#16a34a] py-1.5">
                    WhatsApp the customer
                  </button>
                )}

                {isCompleted && !order?.ratingToken && (
                  <button
                    onClick={handleSendRating}
                    disabled={generatingRating}
                    className="text-[13px] font-semibold text-[#002395] py-1.5 disabled:opacity-50"
                  >
                    {generatingRating ? 'Preparing…' : 'Ask for a rating'}
                  </button>
                )}

                {isCompleted && order?.billCreated && order?.linkedSaleId && (
                  <button
                    onClick={() => navigate(`/sales/${order?.linkedSaleId}`)}
                    className="text-[13px] font-semibold text-[#002395] py-1.5"
                  >
                    View the bill
                  </button>
                )}
              </div>

              {isCompletedBill && !isAdmin && (
                <p className="text-center text-[12px] text-[#94a3b8] font-semibold mt-2.5">
                  <i className="fas fa-lock mr-1.5" aria-hidden="true"></i>Billed - only an admin can change this now
                </p>
              )}
            </div>
          </div>

          {/* ── ISSUES ── */}
          {(order?.complaintTypes?.length > 0 || order?.complaintNature || order?.otherComplaint) && (
            <Section icon="fa-triangle-exclamation" title="Issues Reported" tone="danger">
              <div className="flex flex-wrap gap-2">
                {order?.complaintTypes && order.complaintTypes.length > 0 ? (
                  Array.isArray(order.complaintTypes) ? order.complaintTypes.map((c, i) => (
                    <span key={i} className="bg-[#ED2939]/10 text-[#ED2939] text-xs px-3 py-1.5 rounded-full font-semibold">
                      {c}
                    </span>
                  )) : (
                    <span className="bg-[#ED2939]/10 text-[#ED2939] text-xs px-3 py-1.5 rounded-full font-semibold">
                      {order.complaintTypes}
                    </span>
                  )
                ) : order?.complaintNature ? (
                  <span className="bg-[#ED2939]/10 text-[#ED2939] text-xs px-3 py-1.5 rounded-full font-semibold">
                    {order.complaintNature}
                  </span>
                ) : null}
                {order?.otherComplaint && (
                  <span className="bg-gray-100 text-gray-600 text-xs px-3 py-1.5 rounded-full font-semibold">
                    {order.otherComplaint}
                  </span>
                )}
              </div>
              {order?.problemDetails && (
                <p className="text-sm text-gray-600 mt-3 bg-gray-50 rounded-xl p-3">{order.problemDetails}</p>
              )}
            </Section>
          )}

          {/* ── TIME TRACKING ── */}
          {(order?.receivedAt || order?.expectedCompletionAt) && (
              <Section
                icon="fa-clock"
                title="Time Tracking"
                tone={overdue ? 'danger' : 'brand'}
                action={overdue ? <Chip className="bg-[#ED2939] text-white">Overdue</Chip> : null}
              >
                <InfoGrid>
                  {order?.receivedAt && (
                    <InfoRow
                      label="Received"
                      value={new Date(order?.receivedAt?.toDate?.() || order.receivedAt).toLocaleString('en-IN')}
                    />
                  )}
                  {order?.expectedCompletionAt && (
                    <div className="min-w-0">
                      <p className="text-[11px] text-gray-400">Expected By</p>
                      <p className={`font-semibold text-sm ${overdue ? 'text-[#ED2939]' : 'text-[#0f172a]'}`}>
                        {new Date(order?.expectedCompletionAt?.toDate?.() || order.expectedCompletionAt).toLocaleString('en-IN')}
                      </p>
                    </div>
                  )}
                </InfoGrid>
              </Section>
          )}

          {/* ── SERVICE DETAILS ── */}
          <Section icon="fa-screwdriver-wrench" title="Service Details">
            <InfoGrid>
              <InfoRow label="Technician" value={order?.technicianName} />
              <InfoRow label="Lock Type" value={order?.lockType && order?.lockType !== 'None' ? order?.lockType : undefined} />
              {order?.lockHint && (
                <div className="min-w-0">
                  <p className="text-[11px] text-gray-400">
                    {order?.lockType === 'PIN' ? 'PIN'
                      : order?.lockType === 'Password' ? 'Password'
                      : 'Unlock Code'}
                  </p>
                  {showLockCode ? (
                    <p className="font-semibold text-[#0f172a] text-sm break-all font-mono">
                      {order.lockHint}
                    </p>
                  ) : (
                    /* Kept covered so a passcode is not on show to whoever
                       glances at the counter phone */
                    <button
                      onClick={() => setShowLockCode(true)}
                      className="text-[#002395] text-sm font-bold"
                    >
                      <i className="fas fa-eye mr-1.5"></i>Tap to reveal
                    </button>
                  )}
                </div>
              )}
              {order?.rawMaterialCost > 0 && <InfoRow label="Raw Material" value={`₹${order?.rawMaterialCost}`} />}
              {order?.outsideLabourCost > 0 && <InfoRow label="Outside Labour" value={`₹${order?.outsideLabourCost}`} />}
            </InfoGrid>
            {(order?.imei1 || order?.imei) && (
              <div className="mt-3">
                <InfoRow label="IMEI" value={order?.imei1 || order?.imei} mono />
              </div>
            )}
            <div className="grid grid-cols-1 mt-3">
          {order?.lockPattern && order.lockPattern.filter(Boolean).length > 0 && (() => {
            const pattern = order.lockPattern.filter(Boolean);
            const points = pattern.map(id => {
              const idx = id - 1;
              return {
                id,
                cx: 25 + (idx % 3) * 75,
                cy: 25 + Math.floor(idx / 3) * 75
              };
            });
            return (
              <div className="col-span-2 flex flex-col items-center">
                <p className="text-xs text-gray-400 mb-2 self-start">Pattern</p>
                <div className="relative" style={{ width: '160px', height: '160px' }}>
                  <svg viewBox="0 0 200 200" className="w-40 h-40 bg-[#f0f4ff] rounded-2xl mx-auto" preserveAspectRatio="xMidYMid meet">
                    <defs>
                      <marker
                        id="arrow"
                        viewBox="0 0 10 10"
                        refX="18"
                        refY="5"
                        markerWidth="6"
                        markerHeight="6"
                        orient="auto-start-reverse"
                      >
                        <path d="M 0 1.5 L 7 5 L 0 8.5 z" fill="#002395" />
                      </marker>
                    </defs>
                    
                    {points.slice(0, -1).map((p, i) => {
                      const next = points[i + 1];
                      return (
                        <line
                          key={i}
                          x1={p.cx}
                          y1={p.cy}
                          x2={next.cx}
                          y2={next.cy}
                          stroke="#002395"
                          strokeWidth="3"
                          opacity="0.8"
                          markerEnd="url(#arrow)"
                        />
                      );
                    })}

                    {Array.from({ length: 9 }).map((_, index) => {
                      const id = index + 1;
                      const cx = 25 + (index % 3) * 75;
                      const cy = 25 + Math.floor(index / 3) * 75;
                      const isSelected = pattern.includes(id);
                      const isFirst = pattern[0] === id;
                      const isLast = pattern.length > 1 && pattern[pattern.length - 1] === id;
                      
                      let fill = 'white';
                      let stroke = '#D1D5DB';
                      let textColor = '#6B7280';
                      
                      if (isSelected) {
                        if (isFirst) {
                          fill = '#22C55E';
                          stroke = '#22C55E';
                        } else if (isLast) {
                          fill = '#ED2939';
                          stroke = '#ED2939';
                        } else {
                          fill = '#002395';
                          stroke = '#002395';
                        }
                        textColor = 'white';
                      }
                      
                      return (
                        <g key={id}>
                          <circle cx={cx} cy={cy} r="16" fill={fill} stroke={stroke} strokeWidth="2" />
                          <text
                            x={cx}
                            y={cy}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fill={textColor}
                            fontSize="12"
                            fontWeight="bold"
                          >
                            {id}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
                
                <div style={{display:'flex',alignItems:'center',flexWrap:'wrap',justifyContent:'center',gap:'4px',marginTop:'8px'}}>
                  {pattern.map((dot, index) => (
                    <span key={dot} style={{display:'inline-flex',alignItems:'center',gap:'4px'}}>
                      <span style={{
                        width: '24px', height: '24px',
                        borderRadius: '50%',
                        background: '#002395',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        fontWeight: 'bold'
                      }}>{dot}</span>
                      {index < pattern.length - 1 && (
                        <span style={{color:'#002395',fontWeight:'bold'}}>→</span>
                      )}
                    </span>
                  ))}
                </div>

                <p style={{fontSize:'10px',color:'#666',textAlign:'center',marginTop:'4px'}}>
                  Start: {pattern[0]} → End: {pattern[pattern.length-1]} ({pattern.length} points)
                </p>
              </div>
            );
          })()}
            </div>
          </Section>

          {/* ── ACCESSORIES ── */}
          {order?.accessories?.length > 0 && (
            <Section icon="fa-plug" title="Accessories Collected">
              <div className="flex flex-wrap gap-2">
                {order.accessories.map((acc, i) => (
                  <span key={i} className="bg-[#002395]/10 text-[#002395] text-xs px-3 py-1.5 rounded-full font-semibold">
                    {acc}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* ── SUGGESTIONS ── */}
          {order?.suggestions && (
            <Section icon="fa-note-sticky" title="Notes & Suggestions">
              <p className="text-sm text-gray-600 bg-gray-50 rounded-xl p-3">{order?.suggestions}</p>
            </Section>
          )}

          {/* ── DEVICE IMAGE ── */}
          {order?.imageUrl && (
            <Section icon="fa-camera" title="Device Image">
              {showDeviceImage ? (
                <div className="relative">
                  <img
                    src={imageThumb(order.imageUrl, 400)}
                    loading="lazy"
                    decoding="async"
                    alt="Device"
                    className="w-full h-auto rounded-xl border border-[#e2e8f0] cursor-pointer"
                    onClick={() => {
                      setViewerUrl(order.imageUrl);
                      setViewerTitle(`Device Image - ${order.brand} ${order.model}`);
                      setViewerOpen(true);
                    }}
                  />
                  <button
                    onClick={() => setShowDeviceImage(false)}
                    className="absolute top-2 right-2 bg-black/60 text-white w-8 h-8 rounded-full flex items-center justify-center"
                    aria-label="Hide device image"
                  >
                    <i className="fas fa-eye-slash text-xs"></i>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowDeviceImage(true)}
                  className="w-full py-4 border-2 border-dashed border-[#002395]/30 bg-[#002395]/5 rounded-xl flex items-center justify-center gap-2 text-[#002395] text-sm font-bold"
                >
                  <i className="fas fa-image"></i> View Photo
                </button>
              )}
            </Section>
          )}

          {/* ── DANGER ZONE ── */}
          {userRole?.toLowerCase() === 'admin' && (
            <button
              onClick={() => setDeleteTarget(order)}
              className="w-full bg-white border border-[#ED2939]/20 text-[#ED2939] py-3 rounded-2xl text-sm font-bold"
            >
              <i className="fas fa-trash mr-2"></i>Delete Service Order
            </button>
          )}

          {/* ── LABEL DIALOG ── */}
          {showLabelDialog && (
            <div className="fixed z-[60] inset-0 flex items-center justify-center p-4 bg-black/60 animate-fade-in">
              <div className="fixed inset-0" onClick={() => setShowLabelDialog(false)}></div>
              <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full p-5 z-10">
                <h3 className="text-lg font-bold text-[#0f172a] mb-1">Assign Label Number</h3>
                <p className="text-[#64748b] text-sm mb-4">
                  For order <strong className="text-[#0f172a]">{order.orderNumber}</strong>
                </p>
                <input
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={labelInput}
                  onChange={e => setLabelInput(e.target.value)}
                  className="w-full border-2 border-[#e2e8f0] focus:border-[#002395] outline-none rounded-xl px-4 py-3 text-2xl font-bold text-center mb-4 text-[#0f172a]"
                />
                <div className="space-y-2">
                  <button
                    onClick={confirmAssign}
                    disabled={assigningLabel}
                    className="w-full bg-[#002395] text-white py-3 rounded-xl font-bold text-sm disabled:opacity-50"
                  >
                    {assigningLabel ? 'Assigning...' : `Confirm #${labelInput}`}
                  </button>
                  <button
                    onClick={() => setShowLabelDialog(false)}
                    className="w-full border border-gray-200 text-gray-600 py-3 rounded-xl font-bold text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {showEdit && (
            <ServiceOrderForm initialData={order} onSave={handleUpdate} onCancel={() => setShowEdit(false)} />
          )}

          <NewSaleModal
            isOpen={newSaleModalOpen}
            onClose={() => setNewSaleModalOpen(false)}
            prefillData={salePrefillData}
            onSuccess={fetchOrder}
          />

          <ConfirmDeleteModal
            isOpen={!!deleteTarget}
            onConfirm={handleDelete}
            onCancel={() => setDeleteTarget(null)}
            title="Delete Service Order"
            message={`Are you sure you want to delete service order ${deleteTarget?.orderNumber}? This will also delete any associated rating and deactivate the label. This action cannot be undone.`}
            deleting={deleting}
          />

          <PrinterSelector
            isOpen={showPrinter}
            onClose={() => setShowPrinter(false)}
            htmlContent={labelHTML}
            labelEntry={labelEntryLive}
            title="Print Label"
          />

          {/* ── PRE-DELIVERY CHECKLIST ── */}
          {showCompleteModal && order && (
            <div className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center animate-fade-in">
              <div {...doneSheet} className="bg-[#f1f5f9] w-full md:max-w-md md:mx-auto rounded-t-3xl md:rounded-2xl flex flex-col h-[90dvh] md:h-auto md:max-h-[90vh] overflow-hidden">
                <div {...doneHandle} aria-label="Drag down to close" className="md:hidden flex justify-center pt-2.5 pb-1 bg-white">
                  <div className="w-10 h-1 bg-gray-300 rounded-full"></div>
                </div>
                <div className="flex justify-between items-center px-4 pt-2 pb-3 border-b border-gray-100 bg-white">
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold text-[#0f172a]">Pre-Delivery Checklist</h2>
                    <p className="text-xs text-gray-400 truncate">{order.orderNumber}</p>
                  </div>
                  <button onClick={() => setShowCompleteModal(false)} className="w-10 h-10 rounded-full flex items-center justify-center text-gray-400" aria-label="Close">
                    <i className="fas fa-times text-lg"></i>
                  </button>
                </div>

                <div ref={doneScroll} className="flex-1 overflow-y-auto min-h-0 px-3 py-3 space-y-3">
                  {completeError && (
                    <div className="bg-red-50 border border-red-200 text-[#ED2939] px-4 py-3 rounded-2xl text-sm font-medium">
                      <i className="fas fa-exclamation-circle mr-2"></i>{completeError}
                    </div>
                  )}
                  <div className="bg-white rounded-2xl p-2 shadow-sm">
                    {/* A row is 60px tall with a gap between rows. These were
                        48px targets touching each other, so a thumb aimed at one
                        landed on its neighbour and unticked it. */}
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
                    onClick={() => setShowCompleteModal(false)}
                    className="w-full border border-gray-200 text-gray-600 py-3 rounded-xl text-sm font-bold"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
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
                  Hi {ratingDataForModal.customerName}, your {ratingDataForModal.brand} {ratingDataForModal.model} service (₹{completedOrderForBill?.estimatedPrice || order?.estimatedPrice || 0}) is completed at French Mobiles! 🎉<br/><br/>
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
          {billModalOpen && (completedOrderForBill || order) && (
            <div className="fixed z-50 inset-0 bg-black/60 flex items-end md:items-center justify-center animate-fade-in">
              <div className="fixed inset-0" onClick={() => setBillModalOpen(false)}></div>
              <div {...billSheet} className="relative bg-white w-full md:max-w-sm rounded-t-3xl md:rounded-2xl p-5 z-10 text-center pb-safe">
                <div className="w-14 h-14 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-3">
                  <i className="fas fa-check text-xl"></i>
                </div>
                <h3 className="text-lg font-bold text-[#0f172a] mb-1">Service Completed</h3>
                <p className="text-gray-500 mb-4 text-sm">Create a bill for this service order?</p>
                <div className="space-y-2">
                  <button onClick={() => handleCreateBill()} className="w-full bg-[#002395] text-white py-3.5 rounded-xl font-bold text-sm">
                    Create Bill
                  </button>
                  <button onClick={() => setBillModalOpen(false)} className="w-full border border-gray-200 text-gray-600 py-3 rounded-xl font-bold text-sm">
                    Later
                  </button>
                </div>
              </div>
            </div>
          )}

          <ImageModal
            isOpen={viewerOpen}
            onClose={() => setViewerOpen(false)}
            imageUrl={viewerUrl}
            title={viewerTitle}
          />

        </div>
      </Layout>
    );
};

export default ServiceOrderView;
