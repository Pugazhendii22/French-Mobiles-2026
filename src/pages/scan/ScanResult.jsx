import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/shared/firebase/firebase';
import PatternLock from '@/shared/components/PatternLock';
import ImageModal from '@/shared/ui/ImageModal';
import { Section } from '@/shared/ui/ui';
import { useAuth } from '../../context/AuthContext';
import { imageThumb } from '@/shared/lib/imageUrl';
import { secondHandLabelData } from '@/features/labels/data';

const ScanResult = () => {
  const { labelNumber } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [data, setData] = useState(null);
  const [serviceOrder, setServiceOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showDeviceImage, setShowDeviceImage] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerUrl, setViewerUrl] = useState('');
  const [viewerTitle, setViewerTitle] = useState('');

  useEffect(() => {
    const fetchRegistry = async () => {
      try {
        const q = query(collection(db, 'label_registry'), where('labelNumber', '==', Number(labelNumber)));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const labelData = snap.docs[0].data();
          if (labelData.labelType === 'service_order' && labelData.referenceId) {
            const orderSnap = await getDoc(doc(db, 'service_orders', labelData.referenceId));
            if (orderSnap.exists()) {
              setServiceOrder({ id: orderSnap.id, ...orderSnap.data() });
            }
          }
          /* The label stores a copy of the mobile made when it was printed, so
             a price corrected since then would show the old value here. Lay the
             live record over it; anything the label alone holds is kept. */
          if (labelData.labelType === 'second_hand' && labelData.referenceId) {
            const mobileSnap = await getDoc(doc(db, 'second_hand_mobiles', labelData.referenceId));
            if (mobileSnap.exists()) {
              labelData.data = {
                ...labelData.data,
                ...secondHandLabelData({ id: mobileSnap.id, ...mobileSnap.data() }),
              };
            }
          }
          setData(labelData);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchRegistry();
  }, [labelNumber]);

  if (loading) return <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">Loading...</div>;
  if (!data) return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-4 pt-10 max-w-[480px] mx-auto">
      <div className="bg-[#002395] w-full p-4 rounded-t-2xl text-center break-words">
        <h1 className="text-xl font-bold text-white tracking-widest uppercase">FRENCH MOBILES</h1>
      </div>
      <div className="bg-white p-4 md:p-8 w-full rounded-b-2xl shadow-sm border-x border-b border-[#e2e8f0] text-center break-words">
        <h2 className="text-lg font-bold text-[#0f172a] mb-2">Label #{labelNumber} not found</h2>
      </div>
    </div>
  );

  const { labelType, data: d, assignedAt } = data;
  const receivedAtVal = serviceOrder?.receivedAt || d?.receivedAt || d?.createdAt;
  const expectedCompletionAtVal = serviceOrder?.expectedCompletionAt || d?.expectedCompletionAt;
  const orderStatus = serviceOrder?.status || d?.status;
  
  const parsedReceivedAt = receivedAtVal ? (receivedAtVal.toDate ? receivedAtVal.toDate() : new Date(receivedAtVal)) : null;
  const parsedExpectedCompletionAt = expectedCompletionAtVal ? (expectedCompletionAtVal.toDate ? expectedCompletionAtVal.toDate() : new Date(expectedCompletionAtVal)) : null;
  
  const isValidDate = (dateObj) => dateObj instanceof Date && !isNaN(dateObj.getTime());
  const isOverdue = parsedExpectedCompletionAt && orderStatus !== 'Completed' && parsedExpectedCompletionAt < new Date();

  return (
  <div className="min-h-screen bg-[#f8fafc] pb-8">

    {/* HEADER */}
    <div className="bg-[#002395] px-4 py-4 text-center">
      <p className="text-white/70 text-xs uppercase tracking-widest mb-1">French Mobiles</p>
      <h1 className="text-white font-bold text-lg">Label #{labelNumber}</h1>
      {labelType && (
        <span className={`inline-block mt-2 text-xs px-3 py-1 rounded-full font-medium ${
          labelType === 'service_order' ? 'bg-[#ED2939] text-white' :
          labelType === 'second_hand' ? 'bg-white text-[#002395]' :
          labelType === 'product' ? 'bg-green-400 text-white' :
          'bg-orange-400 text-white'
        }`}>
          {labelType === 'service_order' ? 'Service Order' :
           labelType === 'second_hand' ? 'Second-Hand Mobile' :
           labelType === 'product' ? 'Product' : 'Sale'}
        </span>
      )}
    </div>

    {loading ? (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-[#002395] border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-gray-400 text-sm">Loading...</p>
      </div>
    ) : !data ? (
      <div className="text-center py-20 px-4">
        <i className="fas fa-exclamation-circle text-4xl text-gray-200 mb-3 block"></i>
        <p className="text-gray-500 font-semibold">Label #{labelNumber} not found</p>
        <p className="text-gray-400 text-sm mt-1">This label may not be assigned yet</p>
      </div>
    ) : (
      <div className="px-4 py-4 space-y-4 max-w-md mx-auto">

        {/* Staff only: jump straight into a new sale with this item filled in */}
        {currentUser && (labelType === 'second_hand' || labelType === 'product') && (
          <button
            type="button"
            onClick={() => navigate('/sales', { state: { scanLabelNumber: Number(labelNumber) } })}
            className="w-full bg-[#002395] text-white py-3 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 shadow-sm"
          >
            <i className="fas fa-cart-plus"></i>
            Sell This Item
          </button>
        )}

        {labelType === 'second_hand' && (
          <>
            {/* Main card */}
            <div className="bg-white rounded-2xl shadow-sm border-l-4 border-[#002395] p-5">
              <h2 className="text-xl font-bold text-[#0f172a]">
                {d?.brand} {d?.model}
              </h2>
              <div className="flex gap-2 mt-2 flex-wrap">
                {d?.ram && (
                  <span className="bg-[#002395]/10 text-[#002395] text-xs px-2 py-0.5 rounded-full">
                    {d.ram} RAM
                  </span>
                )}
                {d?.rom && (
                  <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">
                    {d.rom} ROM
                  </span>
                )}
                {d?.grade && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                    d.grade === 'A' ? 'bg-green-100 text-green-700' :
                    d.grade === 'B' ? 'bg-blue-100 text-blue-700' :
                    d.grade === 'C' ? 'bg-orange-100 text-orange-700' :
                    'bg-red-100 text-[#ED2939]'
                  }`}>
                    Grade {d.grade}
                  </span>
                )}
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  d?.status === 'available'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  {d?.status === 'available' ? 'Available' : 'Sold'}
                </span>
              </div>
              <p className="text-2xl font-bold text-[#002395] mt-3">
                ₹{d?.salePrice}
              </p>
              {d?.purchasePrice && (
                <p className="text-xs text-gray-400 mt-1">
                  Purchase Price: ₹{d.purchasePrice}
                </p>
              )}
            </div>

            {/* Device Info */}
            <Section icon="fa-circle-info" title="Device Info">
              <div className="grid grid-cols-2 gap-3">
                {d?.imei1 && (
                  <div>
                    <p className="text-xs text-[#64748b]">IMEI 1</p>
                    <p className="font-semibold text-[#0f172a] text-sm break-all">{d.imei1}</p>
                  </div>
                )}
                {d?.imei2 && (
                  <div>
                    <p className="text-xs text-[#64748b]">IMEI 2</p>
                    <p className="font-semibold text-[#0f172a] text-sm break-all">{d.imei2}</p>
                  </div>
                )}
                {d?.serialNumber && (
                  <div>
                    <p className="text-xs text-[#64748b]">Serial Number</p>
                    <p className="font-semibold text-[#0f172a] text-sm break-all">{d.serialNumber}</p>
                  </div>
                )}
                {d?.condition && (
                  <div>
                    <p className="text-xs text-[#64748b]">Condition</p>
                    <p className="font-semibold text-[#0f172a] text-sm">{d.condition}</p>
                  </div>
                )}
                {d?.purchaseDate && (
                  <div>
                    <p className="text-xs text-[#64748b]">Purchase Date</p>
                    <p className="font-semibold text-[#0f172a] text-sm">{d.purchaseDate}</p>
                  </div>
                )}
                {d?.supplier && (
                  <div>
                    <p className="text-xs text-[#64748b]">Supplier</p>
                    <p className="font-semibold text-[#0f172a] text-sm">{d.supplier}</p>
                  </div>
                )}
                {d?.createdAt && (
                  <div>
                    <p className="text-xs text-[#64748b]">Added On</p>
                    <p className="font-semibold text-[#0f172a] text-sm">
                      {new Date(d.createdAt?.seconds * 1000).toLocaleDateString('en-IN')}
                    </p>
                  </div>
                )}
              </div>
              {d?.specialNotes && (
                <div className="mt-3">
                  <p className="text-xs text-gray-400 mb-1">Notes</p>
                  <p className="text-sm text-gray-600 bg-gray-50 rounded-xl p-3">{d.specialNotes}</p>
                </div>
              )}
            </Section>

            {/* Condition Checklist */}
            {d?.conditionChecklist && Object.keys(d.conditionChecklist).length > 0 && (
              <Section icon="fa-clipboard-check" title="Device Checklist">
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(d.conditionChecklist).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-2">
                      <i className={`fas ${
                        value === 'Working' || value === 'No'
                          ? 'fa-check-circle text-green-500'
                          : 'fa-times-circle text-[#ED2939]'
                      } text-sm flex-shrink-0`}></i>
                      <span className="text-xs text-gray-600 capitalize">
                        {key.replace(/_/g, ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Repair Info */}
            {d?.wasRepaired && d?.repairItems?.length > 0 && (
              <Section icon="fa-screwdriver-wrench" title="Repair History" tone="danger">
                <div className="space-y-2">
                  {d.repairItems.map((item, i) => (
                    <div key={i} className="flex justify-between items-start bg-gray-50 rounded-xl p-3">
                      <div>
                        <p className="text-sm font-semibold text-[#0f172a]">{item.description}</p>
                        {item.technician && (
                          <p className="text-xs text-[#64748b]">{item.technician} · {item.date}</p>
                        )}
                      </div>
                      <p className="text-sm font-bold text-[#ED2939]">₹{item.cost}</p>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between mt-3 pt-3 border-t border-gray-100">
                  <span className="text-sm font-semibold">Total Repair Cost</span>
                  <span className="text-sm font-bold text-[#ED2939]">₹{d.repairCost}</span>
                </div>
              </Section>
            )}

            {/* Seller Info */}
            {d?.sellerName && (
              <Section icon="fa-user" title="Seller Details">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-[#64748b]">Name</p>
                    <p className="font-semibold text-[#0f172a] text-sm">{d.sellerName}</p>
                  </div>
                  {d?.sellerPhone && (
                    <div>
                      <p className="text-xs text-[#64748b]">Phone</p>
                      <a href={`tel:${d.sellerPhone}`}
                        className="font-semibold text-green-600 text-sm flex items-center gap-1">
                        <i className="fas fa-phone text-xs"></i>
                        {d.sellerPhone}
                      </a>
                    </div>
                  )}
                </div>
              </Section>
            )}

            {/* Label Info */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 text-center">
              <p className="text-xs text-[#64748b]">
                Label #{labelNumber} · Assigned on{' '}
                {assignedAt?.toDate?.()?.toLocaleDateString('en-IN')}
              </p>
            </div>
          </>
        )}

        {labelType === 'service_order' && (
          <>
            <div className="bg-white rounded-2xl shadow-sm border-l-4 border-[#ED2939] p-5">
              <p className="text-xs font-bold text-[#ED2939] font-mono">{serviceOrder?.orderNumber || d?.orderNumber}</p>
              <h2 className="text-xl font-bold text-[#0f172a] mt-1">{serviceOrder?.customerName || d?.customerName}</h2>
              <a href={`tel:${serviceOrder?.customerPhone || d?.customerPhone}`} className="text-green-600 text-sm mt-0.5 flex items-center">
                <i className="fas fa-phone mr-1"></i>
                {serviceOrder?.customerPhone || d?.customerPhone}
              </a>
              {(serviceOrder?.alternatePhone || d?.alternatePhone) && (
                <a href={`tel:${serviceOrder?.alternatePhone || d?.alternatePhone}`} className="text-green-600 text-xs mt-0.5 flex items-center">{serviceOrder?.alternatePhone || d?.alternatePhone}</a>
              )}
              <p className="text-lg font-bold text-[#002395] mt-2">₹{serviceOrder?.estimatedPrice || d?.estimatedPrice}</p>
              {(serviceOrder?.advancePaid || d?.advancePaid) > 0 && (
                <p className="text-sm text-green-600 mt-1">Advance: ₹{serviceOrder?.advancePaid || d?.advancePaid}</p>
              )}
              <span className={`mt-2 inline-block text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                (serviceOrder?.status || d?.status) === 'Completed' ? 'bg-green-100 text-green-700' :
                (serviceOrder?.status || d?.status) === 'In Progress' ? 'bg-yellow-100 text-yellow-700' :
                (serviceOrder?.status || d?.status) === 'Parts Awaiting' ? 'bg-orange-100 text-orange-700' :
                (serviceOrder?.status || d?.status) === 'Returned' ? 'bg-red-100 text-[#ED2939]' :
                (serviceOrder?.status || d?.status) === 'Awaiting Customer Approval' ? 'bg-purple-100 text-purple-700' :
                'bg-blue-100 text-blue-700'
              }`}>
                {serviceOrder?.status || d?.status || 'Received'}
              </span>
            </div>

            <Section icon="fa-circle-info" title="Device Info">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-[#64748b]">Brand / Model</p>
                  <p className="font-semibold text-[#0f172a] text-sm">{serviceOrder?.brand || d?.brand} {serviceOrder?.model || d?.model}</p>
                </div>
                {(serviceOrder?.colour || d?.colour) && (
                  <div>
                    <p className="text-xs text-[#64748b]">Colour</p>
                    <p className="font-semibold text-[#0f172a] text-sm">{serviceOrder?.colour || d?.colour}</p>
                  </div>
                )}
                {(serviceOrder?.imei1 || serviceOrder?.imei || d?.imei1) && (
                  <div className="col-span-2">
                    <p className="text-xs text-[#64748b]">IMEI</p>
                    <p className="font-semibold text-[#0f172a] text-sm break-all">{serviceOrder?.imei1 || serviceOrder?.imei || d?.imei1}</p>
                  </div>
                )}
                {serviceOrder?.imei2 && (
                  <div className="col-span-2">
                    <p className="text-xs text-[#64748b]">IMEI 2</p>
                    <p className="font-semibold text-[#0f172a] text-sm break-all">{serviceOrder?.imei2}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-[#64748b]">Technician</p>
                  <p className="font-semibold text-[#0f172a] text-sm">{serviceOrder?.technicianName || d?.technicianName || '-'}</p>
                </div>
                {currentUser && (serviceOrder?.lockType || d?.lockType) && (serviceOrder?.lockType || d?.lockType) !== 'None' && (
                  <div>
                    <p className="text-xs text-[#64748b]">Lock Type</p>
                    <p className="font-semibold text-[#0f172a] text-sm">{serviceOrder?.lockType || d?.lockType}</p>
                  </div>
                )}
              </div>
              {/* This page is public - the label is stuck to the device, so anyone
                  who scans it would otherwise be handed the unlock pattern.
                  Only show it to signed-in staff. */}
              {currentUser && (serviceOrder?.lockPattern || d?.lockPattern || []).filter(Boolean).length > 0 && (
                <div className="mt-3">
                  <p className="text-xs text-gray-400 mb-2">Pattern</p>
                  <PatternLock value={serviceOrder?.lockPattern || d?.lockPattern || []} readOnly />
                </div>
              )}
              {(serviceOrder?.rawMaterialCost || d?.rawMaterialCost) > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-[#64748b]">Raw Material Cost</p>
                  <p className="font-semibold text-[#0f172a] text-sm">₹{serviceOrder?.rawMaterialCost || d?.rawMaterialCost}</p>
                </div>
              )}
              {(serviceOrder?.outsideLabourCost || d?.outsideLabourCost) > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-[#64748b]">Outside Labour</p>
                  <p className="font-semibold text-[#0f172a] text-sm">₹{serviceOrder?.outsideLabourCost || d?.outsideLabourCost}</p>
                </div>
              )}
            </Section>

            {/* TIME TRACKING */}
            {(isValidDate(parsedReceivedAt) || isValidDate(parsedExpectedCompletionAt)) && (
              <div className={`bg-white rounded-2xl shadow-sm border-l-4 p-4 ${
                isOverdue ? 'border-[#ED2939]' : 'border-green-500'
              }`}>
                <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3">
                  Time Tracking
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {isValidDate(parsedReceivedAt) && (
                    <div>
                      <p className="text-xs text-[#64748b]">Received</p>
                      <p className="font-semibold text-[#0f172a] text-sm">
                        {parsedReceivedAt.toLocaleString('en-IN')}
                      </p>
                    </div>
                  )}
                  {isValidDate(parsedExpectedCompletionAt) && (
                    <div>
                      <p className="text-xs text-[#64748b]">Expected By</p>
                      <p className={`font-semibold text-sm ${isOverdue ? 'text-[#ED2939]' : 'text-[#0f172a]'}`}>
                        {parsedExpectedCompletionAt.toLocaleString('en-IN')}
                        {isOverdue && (
                          <span className="ml-1 text-xs bg-[#ED2939] text-white px-1.5 py-0.5 rounded-full">
                            OVERDUE
                          </span>
                        )}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {(serviceOrder?.complaintTypes || d?.complaintTypes)?.length > 0 && (
              <Section icon="fa-triangle-exclamation" title="Issues Reported" tone="danger">
                <div className="flex flex-wrap gap-2">
                  {(serviceOrder?.complaintTypes || d?.complaintTypes)?.map((c, i) => (
                    <span key={i} className="bg-[#ED2939]/10 text-[#ED2939] text-xs px-3 py-1 rounded-full font-medium">
                      {c}
                    </span>
                  ))}
                  {(serviceOrder?.otherComplaint || d?.otherComplaint) && (
                    <span className="bg-gray-100 text-gray-600 text-xs px-3 py-1 rounded-full">
                      {serviceOrder?.otherComplaint || d?.otherComplaint}
                    </span>
                  )}
                </div>
                {(serviceOrder?.problemDetails || d?.problemDetails) && (
                  <p className="text-sm text-gray-600 mt-3 bg-gray-50 rounded-xl p-3">{serviceOrder?.problemDetails || d?.problemDetails}</p>
                )}
              </Section>
            )}

            {(serviceOrder?.accessories || d?.accessories || serviceOrder?.accessoriesCollected)?.length > 0 && (
              <Section icon="fa-plug" title="Accessories Collected">
                <div className="flex flex-wrap gap-2">
                  {(serviceOrder?.accessories || d?.accessories || serviceOrder?.accessoriesCollected || []).map((acc, i) => (
                    <span key={i} className="bg-[#002395]/10 text-[#002395] text-xs px-3 py-1 rounded-full">
                      {acc}
                    </span>
                  ))}
                </div>
              </Section>
            )}

            {(serviceOrder?.suggestions || d?.suggestions) && (
              <Section icon="fa-note-sticky" title="Notes & Suggestions">
                <p className="text-sm text-gray-600 bg-gray-50 rounded-xl p-3">{serviceOrder?.suggestions || d?.suggestions}</p>
              </Section>
            )}

            {(serviceOrder?.imageUrl || d?.imageUrl) && (
              <Section icon="fa-camera" title="Device Image">
                <div className="flex justify-center">
                  {showDeviceImage ? (
                    <div className="relative w-full">
                      <img
                        src={imageThumb(serviceOrder?.imageUrl || d?.imageUrl, 400)}
                        alt="Device"
                        loading="lazy"
                        decoding="async"
                        className="max-w-full h-auto rounded-lg shadow-sm border border-[#e2e8f0] cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => {
                          setViewerUrl(serviceOrder?.imageUrl || d?.imageUrl);
                          setViewerTitle('Device Image');
                          setViewerOpen(true);
                        }}
                      />
                      <button
                        onClick={() => setShowDeviceImage(false)}
                        className="absolute top-1 right-1 bg-black/50 text-white text-xs px-2 py-1 rounded-lg"
                      >
                        Hide
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowDeviceImage(true)}
                      className="w-full h-16 border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center gap-2 text-[#002395] text-sm font-medium"
                    >
                      <i className="fas fa-image"></i> View Photo
                    </button>
                  )}
                </div>
              </Section>
            )}
          </>
        )}

        {labelType === 'product' && (
          <>
            <div className="bg-white rounded-2xl shadow-sm border-l-4 border-green-500 p-5">
              <h2 className="text-xl font-bold text-[#0f172a]">{d?.productName}</h2>
              <p className="text-gray-400 text-sm mt-0.5">
                {d?.brand} · {d?.category}
              </p>
              <p className="text-2xl font-bold text-[#002395] mt-2">₹{d?.salePrice}</p>
            </div>
            <Section icon="fa-box" title="Stock Info">
              <div className="grid grid-cols-2 gap-3">
                {d?.sku && (
                  <div>
                    <p className="text-xs text-[#64748b]">SKU</p>
                    <p className="font-semibold text-[#0f172a] text-sm">{d.sku}</p>
                  </div>
                )}
                {d?.stockQuantity && (
                  <div>
                    <p className="text-xs text-[#64748b]">Stock</p>
                    <p className="font-semibold text-[#0f172a] text-sm">{d.stockQuantity} units</p>
                  </div>
                )}
              </div>
            </Section>
          </>
        )}

        {labelType === 'sale' && (
          <>
            <div className="bg-white rounded-2xl shadow-sm border-l-4 border-orange-500 p-5">
              <p className="text-xs font-bold text-[#002395] font-mono">{d?.invoiceNumber}</p>
              <h2 className="text-xl font-bold text-[#0f172a] mt-1">{d?.customerName}</h2>
              <a href={`tel:${d?.customerPhone}`} className="text-green-600 text-sm mt-0.5 block">{d?.customerPhone}</a>
              <p className="text-2xl font-bold text-[#002395] mt-2">₹{d?.totalAmount}</p>
            </div>
            {d?.walletUsed > 0 && (
              <div className="flex justify-between text-sm px-4">
                <span className="text-[#002395]">Wallet Used</span>
                <span className="font-medium text-[#002395]">- ₹{d?.walletUsed}</span>
              </div>
            )}
            {d?.items?.length > 0 && (
              <Section icon="fa-box" title="Items">
                <div className="space-y-2">
                  {d.items.map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-[#0f172a]">{item.name}</span>
                      <span className="font-semibold text-[#002395]">₹{item.total}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-400 text-center">
            Assigned on {assignedAt ? new Date(assignedAt).toLocaleDateString('en-IN') : '-'}
          </p>
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
);
};

export default ScanResult;
