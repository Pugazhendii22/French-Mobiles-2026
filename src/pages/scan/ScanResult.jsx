import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import PatternLock from '../../components/PatternLock';
import ImageModal from '../../components/common/ImageModal';

const Badge = ({ children, color }) => (
  <span className={`rounded-full px-3 py-1 text-xs font-bold ${color}`}>
    {children}
  </span>
);

const Row = ({ label, value, isBold = true }) => (
  <div className="flex justify-between items-start py-1">
    <span className="text-gray-500 text-sm">{label}</span>
    <span className={`text-sm ${isBold ? 'font-medium' : ''} text-right`}>{value}</span>
  </div>
);

const Section = ({ title, children }) => (
  <div className="bg-white rounded-xl p-4 mb-3 shadow-sm break-words">
    {title && <h3 className="text-xs font-bold text-gray-500 uppercase mb-3">{title}</h3>}
    {children}
  </div>
);

const ScanResult = () => {
  const { labelNumber } = useParams();
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
          setData(labelData);
          if (labelData.labelType === 'service_order' && labelData.referenceId) {
            const orderSnap = await getDoc(doc(db, 'service_orders', labelData.referenceId));
            if (orderSnap.exists()) {
              setServiceOrder({ id: orderSnap.id, ...orderSnap.data() });
            }
          }
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
  const hasPatternLock = d?.lockType === 'Pattern' || (Array.isArray(d?.lockPattern) && d.lockPattern.length > 0);

  const typeColor = {
    second_hand: 'bg-purple-100 text-purple-800',
    service_order: 'bg-blue-100 text-blue-800',
    product: 'bg-teal-100 text-teal-800',
    sale: 'bg-green-100 text-green-800'
  }[labelType] || 'bg-gray-100 text-gray-800';

  const typeName = labelType.replace('_', ' ').toUpperCase();

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
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
                Device Info
              </p>
              <div className="grid grid-cols-2 gap-3">
                {d?.imei1 && (
                  <div>
                    <p className="text-xs text-gray-400">IMEI 1</p>
                    <p className="font-semibold text-[#0f172a] text-sm break-all">{d.imei1}</p>
                  </div>
                )}
                {d?.imei2 && (
                  <div>
                    <p className="text-xs text-gray-400">IMEI 2</p>
                    <p className="font-semibold text-[#0f172a] text-sm break-all">{d.imei2}</p>
                  </div>
                )}
                {d?.serialNumber && (
                  <div>
                    <p className="text-xs text-gray-400">Serial Number</p>
                    <p className="font-semibold text-[#0f172a] text-sm break-all">{d.serialNumber}</p>
                  </div>
                )}
                {d?.condition && (
                  <div>
                    <p className="text-xs text-gray-400">Condition</p>
                    <p className="font-semibold text-[#0f172a] text-sm">{d.condition}</p>
                  </div>
                )}
                {d?.purchaseDate && (
                  <div>
                    <p className="text-xs text-gray-400">Purchase Date</p>
                    <p className="font-semibold text-[#0f172a] text-sm">{d.purchaseDate}</p>
                  </div>
                )}
                {d?.supplier && (
                  <div>
                    <p className="text-xs text-gray-400">Supplier</p>
                    <p className="font-semibold text-[#0f172a] text-sm">{d.supplier}</p>
                  </div>
                )}
                {d?.createdAt && (
                  <div>
                    <p className="text-xs text-gray-400">Added On</p>
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
            </div>

            {/* Condition Checklist */}
            {d?.conditionChecklist && Object.keys(d.conditionChecklist).length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
                  Device Checklist
                </p>
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
              </div>
            )}

            {/* Repair Info */}
            {d?.wasRepaired && d?.repairItems?.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <p className="text-xs font-bold text-[#ED2939] uppercase tracking-wide mb-3 border-l-4 border-[#ED2939] pl-3">
                  Repair History
                </p>
                <div className="space-y-2">
                  {d.repairItems.map((item, i) => (
                    <div key={i} className="flex justify-between items-start bg-gray-50 rounded-xl p-3">
                      <div>
                        <p className="text-sm font-semibold text-[#0f172a]">{item.description}</p>
                        {item.technician && (
                          <p className="text-xs text-gray-400">{item.technician} · {item.date}</p>
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
              </div>
            )}

            {/* Seller Info */}
            {d?.sellerName && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
                  Seller Details
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-400">Name</p>
                    <p className="font-semibold text-[#0f172a] text-sm">{d.sellerName}</p>
                  </div>
                  {d?.sellerPhone && (
                    <div>
                      <p className="text-xs text-gray-400">Phone</p>
                      <a href={`tel:${d.sellerPhone}`}
                        className="font-semibold text-green-600 text-sm flex items-center gap-1">
                        <i className="fas fa-phone text-xs"></i>
                        {d.sellerPhone}
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Label Info */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 text-center">
              <p className="text-xs text-gray-400">
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

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
                Device Info
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-400">Brand / Model</p>
                  <p className="font-semibold text-[#0f172a] text-sm">{serviceOrder?.brand || d?.brand} {serviceOrder?.model || d?.model}</p>
                </div>
                {(serviceOrder?.colour || d?.colour) && (
                  <div>
                    <p className="text-xs text-gray-400">Colour</p>
                    <p className="font-semibold text-[#0f172a] text-sm">{serviceOrder?.colour || d?.colour}</p>
                  </div>
                )}
                {(serviceOrder?.imei1 || serviceOrder?.imei || d?.imei1) && (
                  <div className="col-span-2">
                    <p className="text-xs text-gray-400">IMEI</p>
                    <p className="font-semibold text-[#0f172a] text-sm break-all">{serviceOrder?.imei1 || serviceOrder?.imei || d?.imei1}</p>
                  </div>
                )}
                {serviceOrder?.imei2 && (
                  <div className="col-span-2">
                    <p className="text-xs text-gray-400">IMEI 2</p>
                    <p className="font-semibold text-[#0f172a] text-sm break-all">{serviceOrder?.imei2}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-gray-400">Technician</p>
                  <p className="font-semibold text-[#0f172a] text-sm">{serviceOrder?.technicianName || d?.technicianName || '-'}</p>
                </div>
                {(serviceOrder?.lockType || d?.lockType) && (serviceOrder?.lockType || d?.lockType) !== 'None' && (
                  <div>
                    <p className="text-xs text-gray-400">Lock Type</p>
                    <p className="font-semibold text-[#0f172a] text-sm">{serviceOrder?.lockType || d?.lockType}</p>
                  </div>
                )}
              </div>
               {((serviceOrder?.lockPattern || d?.lockPattern)?.filter(Boolean).length > 0) && (() => {
                const pattern = (serviceOrder?.lockPattern || d?.lockPattern).filter(Boolean);
                const points = pattern.map(id => {
                  const idx = id - 1;
                  return {
                    id,
                    cx: 25 + (idx % 3) * 75,
                    cy: 25 + Math.floor(idx / 3) * 75
                  };
                });
                return (
                  <div className="mt-3 flex flex-col items-center">
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
                      {pattern.map((dot, index) => {
                        const isFirst = index === 0;
                        const isLast = pattern.length > 1 && index === pattern.length - 1;
                        const dotBg = isFirst ? '#22C55E' : isLast ? '#ED2939' : '#002395';
                        
                        return (
                          <span key={dot} style={{display:'inline-flex',alignItems:'center',gap:'4px'}}>
                            <span style={{
                              width: '24px', height: '24px',
                              borderRadius: '50%',
                              background: dotBg,
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
                        );
                      })}
                    </div>

                    <p style={{fontSize:'10px',color:'#666',textAlign:'center',marginTop:'4px'}}>
                      Start: {pattern[0]} → End: {pattern[pattern.length-1]} ({pattern.length} points)
                    </p>
                  </div>
                );
              })()}
              {(serviceOrder?.rawMaterialCost || d?.rawMaterialCost) > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-gray-400">Raw Material Cost</p>
                  <p className="font-semibold text-[#0f172a] text-sm">₹{serviceOrder?.rawMaterialCost || d?.rawMaterialCost}</p>
                </div>
              )}
              {(serviceOrder?.outsideLabourCost || d?.outsideLabourCost) > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-gray-400">Outside Labour</p>
                  <p className="font-semibold text-[#0f172a] text-sm">₹{serviceOrder?.outsideLabourCost || d?.outsideLabourCost}</p>
                </div>
              )}
            </div>

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
                      <p className="text-xs text-gray-400">Received</p>
                      <p className="font-semibold text-[#0f172a] text-sm">
                        {parsedReceivedAt.toLocaleString('en-IN')}
                      </p>
                    </div>
                  )}
                  {isValidDate(parsedExpectedCompletionAt) && (
                    <div>
                      <p className="text-xs text-gray-400">Expected By</p>
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
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <p className="text-xs font-bold text-[#ED2939] uppercase tracking-wide mb-3 border-l-4 border-[#ED2939] pl-3">
                  Issues Reported
                </p>
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
              </div>
            )}

            {(serviceOrder?.accessories || d?.accessories || serviceOrder?.accessoriesCollected)?.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
                  Accessories Collected
                </p>
                <div className="flex flex-wrap gap-2">
                  {(serviceOrder?.accessories || d?.accessories || serviceOrder?.accessoriesCollected || []).map((acc, i) => (
                    <span key={i} className="bg-[#002395]/10 text-[#002395] text-xs px-3 py-1 rounded-full">
                      {acc}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {(serviceOrder?.suggestions || d?.suggestions) && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
                  Notes & Suggestions
                </p>
                <p className="text-sm text-gray-600 bg-gray-50 rounded-xl p-3">{serviceOrder?.suggestions || d?.suggestions}</p>
              </div>
            )}

            {(serviceOrder?.imageUrl || d?.imageUrl) && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
                  Device Image
                </p>
                <div className="flex justify-center">
                  {showDeviceImage ? (
                    <div className="relative w-full">
                      <img
                        src={serviceOrder?.imageUrl || d?.imageUrl}
                        alt="Device"
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
              </div>
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
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
                Stock Info
              </p>
              <div className="grid grid-cols-2 gap-3">
                {d?.sku && (
                  <div>
                    <p className="text-xs text-gray-400">SKU</p>
                    <p className="font-semibold text-[#0f172a] text-sm">{d.sku}</p>
                  </div>
                )}
                {d?.stockQuantity && (
                  <div>
                    <p className="text-xs text-gray-400">Stock</p>
                    <p className="font-semibold text-[#0f172a] text-sm">{d.stockQuantity} units</p>
                  </div>
                )}
              </div>
            </div>
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
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
                  Items
                </p>
                <div className="space-y-2">
                  {d.items.map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-[#0f172a]">{item.name}</span>
                      <span className="font-semibold text-[#002395]">₹{item.total}</span>
                    </div>
                  ))}
                </div>
              </div>
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
