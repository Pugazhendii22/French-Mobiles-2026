import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { doc, getDoc, updateDoc, collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../../firebase/firebase';
import { useSettings } from '../../context/SettingsContext';
import SecondHandForm from './SecondHandForm';
import { getLabelNumber } from '../../utils/getLabelNumber';
import { printLabel, generateLabelHTML } from '../../utils/printLabel.jsx';
import PrinterSelector from '../../components/PrinterSelector';
import Layout from '../../components/common/Layout';
import ImageModal from '../../components/common/ImageModal';

const gradeColor = (g) => ({ 
  A: 'bg-green-100 text-green-700', 
  B: 'bg-blue-100 text-blue-700', 
  C: 'bg-orange-100 text-orange-700', 
  D: 'bg-red-100 text-red-700' 
}[g] || 'bg-gray-100 text-[#64748b]');

const groupByCategory = (items) => {
  const grouped = {}
  items.forEach(item => {
    const cat = item.category || 'Display'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(item)
  })
  return grouped
}

const SecondHandView = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { deviceChecklist } = useSettings();
  const [mobile, setMobile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [labelEntry, setLabelEntry] = useState(null);
  const [showLabelDialog, setShowLabelDialog] = useState(false);
  const [labelInput, setLabelInput] = useState('');
  const [assigningLabel, setAssigningLabel] = useState(false);
  const [showPrinter, setShowPrinter] = useState(false);
  const [labelHTML, setLabelHTML] = useState('');
  const [showImage, setShowImage] = useState({});
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerUrl, setViewerUrl] = useState('');
  const [viewerTitle, setViewerTitle] = useState('');

  const fetchMobile = async () => {
    try {
      const docSnap = await getDoc(doc(db, 'second_hand_mobiles', id));
      if (docSnap.exists()) setMobile({ id: docSnap.id, ...docSnap.data() });
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const fetchLabel = async () => {
    const snap = await getDocs(query(collection(db, 'label_registry'), where('referenceId', '==', id), where('labelType', '==', 'second_hand')));
    if (!snap.empty) setLabelEntry(snap.docs[0].data());
  };

  useEffect(() => { fetchMobile(); fetchLabel(); }, [id]);

  const handleUpdate = async (data) => {
    const updated = { ...data, updatedAt: new Date().toISOString() };
    await updateDoc(doc(db, 'second_hand_mobiles', id), updated);
    setMobile({ id, ...updated });
    return id;
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
        labelType: 'second_hand',
        referenceId: id,
        assignedBy: auth.currentUser?.uid || 'unknown',
        assignedAt: new Date().toISOString(),
        isActive: true,
        data: {
          brand: mobile.brand || '', model: mobile.model || '',
          ram: mobile.ram || '', rom: mobile.rom || '',
          condition: mobile.condition || '', grade: mobile.condition || '',
          imei1: mobile.imei1 || '', imei2: mobile.imei2 || '',
          serialNumber: mobile.serialNumber || '',
          purchasePrice: Number(mobile.purchasePrice || 0),
          salePrice: Number(mobile.salePrice || 0),
          purchaseDate: mobile.purchaseDate || '', supplier: mobile.supplier || '',
          specialNotes: mobile.notes || '',
          frontImageUrl: mobile.frontImageUrl || '', backImageUrl: mobile.backImageUrl || '',
          status: mobile.status || '', createdBy: mobile.createdBy || '', createdAt: mobile.createdAt || '',
        }
      };
      await addDoc(collection(db, 'label_registry'), labelData);
      setLabelEntry(labelData);
      setShowLabelDialog(false);
    } catch (err) { console.error(err); alert('Failed to assign label.'); }
    finally { setAssigningLabel(false); }
  };

  if (loading) return <div className="p-4 md:p-8 text-center text-[#0f172a] font-bold">Loading...</div>;
  if (!mobile) return <div className="p-4 md:p-8 text-center text-[#ED2939] font-bold">Mobile not found</div>;

  return (
    <Layout title="Second-Hand Detail" pageType="detail" backTo="/inventory/second-hand">
      <div className="min-h-screen bg-[#f8fafc] pb-24">

        {/* HEADER */}
        <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-30 shadow-sm">
          <button onClick={() => navigate('/inventory/second-hand')} className="text-[#002395] p-1">
            <i className="fas fa-arrow-left text-lg"></i>
          </button>
          <h1 className="text-lg font-bold text-[#0f172a] flex-1">Mobile Details</h1>
        </div>

        <div className="px-4 py-4 space-y-4">

          {/* MAIN CARD */}
          <div className={`bg-white rounded-2xl shadow-sm border-l-4 p-5 ${
            mobile?.condition === 'A' ? 'border-green-500' :
            mobile?.condition === 'B' ? 'border-[#002395]' :
            mobile?.condition === 'C' ? 'border-orange-500' :
            'border-[#ED2939]'
          }`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold text-[#0f172a]">
                  {mobile?.brand} {mobile?.model}
                </h2>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {mobile?.ram && (
                    <span className="bg-[#002395]/10 text-[#002395] text-xs px-2 py-0.5 rounded-full">
                      {mobile?.ram} RAM
                    </span>
                  )}
                  {mobile?.rom && (
                    <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">
                      {mobile?.rom} ROM
                    </span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${gradeColor(mobile?.condition)}`}>
                    Grade {mobile?.condition}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    mobile?.status === 'available' || !mobile?.status
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {mobile?.status === 'available' || !mobile?.status ? 'Available' : 'Sold'}
                  </span>
                  {labelEntry && (
                    <span className="bg-[#002395]/10 text-[#002395] text-xs px-2 py-0.5 rounded-full font-bold">
                      <i className="fas fa-tag mr-1"></i>Label #{labelEntry.labelNumber}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-[#002395]">₹{mobile?.salePrice}</p>
                {mobile?.purchasePrice && (
                  <p className="text-xs text-gray-400">Cost: ₹{mobile?.purchasePrice}</p>
                )}
              </div>
            </div>

            {/* ACTION BUTTONS */}
            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-100">
              <button
                onClick={() => setShowEdit(true)}
                className="flex items-center gap-1.5 bg-[#002395]/10 text-[#002395] px-3 py-2 rounded-xl text-xs font-semibold"
              >
                <i className="fas fa-edit"></i> Edit
              </button>
              {(mobile?.status === 'available' || !mobile?.status) && (
                <button
                  onClick={() => {
                    navigate('/sales', {
                      state: {
                        items: [
                          {
                            type: 'Second-hand',
                            itemId: mobile.id,
                            name: `${mobile.brand} ${mobile.model}`,
                            quantity: 1,
                            unitPrice: Number(mobile.salePrice || 0),
                            purchaseCost: Number(mobile.purchasePrice || 0),
                            repairCost: Number(mobile.repairCost || 0),
                            imei: mobile.imei1 || ''
                          }
                        ]
                      }
                    });
                  }}
                  className="flex items-center gap-1.5 bg-green-600 text-white px-3 py-2 rounded-xl text-xs font-semibold hover:bg-green-700 transition"
                >
                  <i className="fas fa-shopping-cart"></i> Sell Mobile
                </button>
              )}
              {labelEntry ? (
                <button
                  onClick={() => {
                    const html = generateLabelHTML(labelEntry)
                    setLabelHTML(html)
                    setShowPrinter(true)
                  }}
                  className="flex items-center gap-1.5 bg-[#ED2939]/10 text-[#ED2939] px-3 py-2 rounded-xl text-xs font-semibold"
                >
                  <i className="fas fa-print"></i> Print #{labelEntry.labelNumber}
                </button>
              ) : (
                <button
                  onClick={openLabelDialog}
                  className="flex items-center gap-1.5 bg-gray-100 text-gray-700 px-3 py-2 rounded-xl text-xs font-semibold"
                >
                  <i className="fas fa-tag"></i> Assign Label
                </button>
              )}
            </div>
          </div>

          {/* DEVICE INFO */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
              Device Info
            </p>
            <div className="grid grid-cols-2 gap-3">
              {mobile?.imei1 && (
                <div>
                  <p className="text-xs text-gray-400">IMEI 1</p>
                  <p className="font-semibold text-[#0f172a] text-sm break-all">{mobile?.imei1}</p>
                </div>
              )}
              {mobile?.imei2 && (
                <div>
                  <p className="text-xs text-gray-400">IMEI 2</p>
                  <p className="font-semibold text-[#0f172a] text-sm break-all">{mobile?.imei2}</p>
                </div>
              )}
              {mobile?.serialNumber && (
                <div>
                  <p className="text-xs text-gray-400">Serial Number</p>
                  <p className="font-semibold text-[#0f172a] text-sm break-all">{mobile?.serialNumber}</p>
                </div>
              )}
              {mobile?.purchaseDate && (
                <div>
                  <p className="text-xs text-gray-400">Purchase Date</p>
                  <p className="font-semibold text-[#0f172a] text-sm">{mobile?.purchaseDate}</p>
                </div>
              )}
              {mobile?.supplier && (
                <div>
                  <p className="text-xs text-gray-400">Supplier</p>
                  <p className="font-semibold text-[#0f172a] text-sm">{mobile?.supplier}</p>
                </div>
              )}
            </div>
            {mobile?.notes && (
              <div className="mt-3">
                <p className="text-xs text-gray-400 mb-1">Notes</p>
                <p className="text-sm text-gray-600 bg-gray-50 rounded-xl p-3">{mobile?.notes}</p>
              </div>
            )}
          </div>

          {/* CONDITION CHECKLIST */}
          {mobile?.conditionChecklist && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
                Device Checklist
              </p>

              {(() => {
                const isApple = mobile?.brand?.toLowerCase() === 'apple'
                const specificItems = isApple
                  ? (deviceChecklist.iphone || [])
                  : (deviceChecklist.android || [])
                const commonItems = deviceChecklist.common || []

                return (
                  <>
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl mb-3 self-start ${
                      isApple ? 'bg-gray-100 text-gray-700' : 'bg-green-50 text-green-700'
                    }`}>
                      <i className={`fab ${isApple ? 'fa-apple' : 'fa-android'} text-sm`}></i>
                      <span className="text-xs font-semibold">
                        {isApple ? 'iPhone' : 'Android'}
                      </span>
                    </div>

                    {(() => {
                      const groupedCommon = groupByCategory(commonItems)
                      return Object.keys(groupedCommon).length > 0 && (
                        <div className="mb-4">
                          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide border-b border-gray-100 pb-1 mb-2 pl-2">
                            Common Checks
                          </p>
                          <div className="space-y-3">
                            {Object.entries(groupedCommon).map(([category, items]) => (
                              <div key={category} className="space-y-1 pl-2">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{category}</p>
                                <div className="grid grid-cols-2 gap-2">
                                  {items.map((item, idx) => {
                                    const key = item.label.replace(/\s+/g, '_').toLowerCase()
                                    const value = mobile?.conditionChecklist?.[key]
                                    if (!value) return null
                                    const isGood = value === 'Working' || value === 'No'
                                    return (
                                      <div key={idx} className="flex items-center gap-2">
                                        <i className={`fas ${isGood ? 'fa-check-circle text-green-500' : 'fa-times-circle text-[#ED2939]'} text-sm flex-shrink-0`}></i>
                                        <span className="text-xs text-gray-600 truncate">{item.label}</span>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })()}

                    {(() => {
                      const groupedSpecific = groupByCategory(specificItems)
                      return Object.keys(groupedSpecific).length > 0 && (
                        <div>
                          <p className="text-xs font-bold text-[#002395] uppercase tracking-wide border-b border-gray-100 pb-1 mb-2 pl-2">
                            {isApple ? 'iPhone Specific' : 'Android Specific'}
                          </p>
                          <div className="space-y-3">
                            {Object.entries(groupedSpecific).map(([category, items]) => (
                              <div key={category} className="space-y-1 pl-2">
                                <p className="text-[10px] font-bold text-[#002395]/70 uppercase tracking-wider">{category}</p>
                                <div className="grid grid-cols-2 gap-2">
                                  {items.map((item, idx) => {
                                    const key = item.label.replace(/\s+/g, '_').toLowerCase()
                                    const value = mobile?.conditionChecklist?.[key]
                                    if (!value) return null
                                    const isGood = value === 'Working' || value === 'No'
                                    return (
                                      <div key={idx} className="flex items-center gap-2">
                                        <i className={`fas ${isGood ? 'fa-check-circle text-green-500' : 'fa-times-circle text-[#ED2939]'} text-sm flex-shrink-0`}></i>
                                        <span className="text-xs text-gray-600 truncate">{item.label}</span>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })()}
                  </>
                )
              })()}
            </div>
          )}

          {/* REPAIR & REFURBISHMENT */}
          {mobile?.wasRepaired && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <p className="text-xs font-bold text-[#ED2939] uppercase tracking-wide mb-3 border-l-4 border-[#ED2939] pl-3">
                Repair &amp; Refurbishment
              </p>
              <div className="space-y-3 mb-3">
                {mobile?.repairItems?.map((item, index) => (
                  <div key={index} className="bg-gray-50 rounded-xl p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-[#0f172a]">{item.description}</p>
                        {item.technician && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            <i className="fas fa-user mr-1"></i>{item.technician}
                          </p>
                        )}
                        {item.date && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            <i className="fas fa-calendar mr-1"></i>{item.date}
                          </p>
                        )}
                      </div>
                      <p className="text-sm font-bold text-[#ED2939] ml-3">₹{item.cost}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="bg-[#ED2939]/5 rounded-xl p-3 border border-[#ED2939]/20">
                <div className="flex justify-between text-sm font-bold text-[#ED2939]">
                  <span>Total Repair Cost</span>
                  <span>₹{mobile?.repairCost}</span>
                </div>
              </div>
            </div>
          )}

          {/* COST & PROFIT */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
              Cost &amp; Profit
            </p>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Purchase Price</span>
                <span className="font-medium">₹{mobile?.purchasePrice || 0}</span>
              </div>
              {mobile?.wasRepaired && mobile?.repairCost > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Repair Cost</span>
                  <span className="font-medium text-[#ED2939]">₹{mobile?.repairCost}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-semibold border-t border-gray-100 pt-2">
                <span>Total Cost</span>
                <span>₹{mobile?.totalCost || mobile?.purchasePrice || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Sale Price</span>
                <span className="font-medium">₹{mobile?.salePrice || 0}</span>
              </div>
              <div className={`flex justify-between text-base font-bold border-t border-gray-100 pt-2 ${
                (mobile?.profit || 0) >= 0 ? 'text-green-600' : 'text-[#ED2939]'
              }`}>
                <span>Profit</span>
                <span>₹{mobile?.profit || 0}</span>
              </div>
            </div>
          </div>

          {/* SELLER DETAILS */}
          {mobile?.sellerCustomerId && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
                Seller Details
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-400">Name</p>
                  <p className="font-semibold text-[#0f172a] text-sm">{mobile?.sellerName}</p>
                </div>
                {mobile?.sellerPhone && (
                  <div>
                    <p className="text-xs text-gray-400">Phone</p>
                    <a href={`tel:${mobile?.sellerPhone}`} className="font-semibold text-green-600 text-sm block">{mobile?.sellerPhone}</a>
                  </div>
                )}
              </div>
              <button
                onClick={() => navigate(`/customers/${mobile?.sellerCustomerId}`)}
                className="mt-3 text-xs text-[#002395] font-semibold"
              >
                <i className="fas fa-user mr-1"></i> View Customer Profile
              </button>
            </div>
          )}

          {/* PHOTOS */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
              Photos &amp; Documents
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { label: 'Front View', url: mobile?.photo1Url || mobile?.frontImageUrl, key: 'photo1' },
                { label: 'Back View',  url: mobile?.photo2Url || mobile?.backImageUrl, key: 'photo2' },
                { label: 'Left Side',  url: mobile?.photo3Url, key: 'photo3' },
                { label: 'Right Side', url: mobile?.photo4Url, key: 'photo4' },
                { label: 'Top/Bottom', url: mobile?.photo5Url, key: 'photo5' },
                { label: 'Additional', url: mobile?.photo6Url, key: 'photo6' },
                { label: 'ID Front',   url: mobile?.idCardFrontUrl, key: 'idFront' },
                { label: 'ID Back',    url: mobile?.idCardBackUrl, key: 'idBack' },
              ].map((img, idx) => (
                <div key={idx} className="flex flex-col">
                  {img.url ? (
                    showImage[img.key] ? (
                      <div className="relative w-full aspect-square">
                        <img
                          src={img.url}
                          alt={img.label}
                          className="w-full h-full object-cover rounded-xl shadow-sm border border-[#e2e8f0] cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => {
                            setViewerUrl(img.url);
                            setViewerTitle(`${mobile?.brand} ${mobile?.model} - ${img.label}`);
                            setViewerOpen(true);
                          }}
                        />
                        <button
                          onClick={() => setShowImage(prev => ({ ...prev, [img.key]: false }))}
                          className="absolute top-1 right-1 bg-black/50 text-white text-xs px-2 py-1 rounded-lg"
                        >
                          Hide
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowImage(prev => ({ ...prev, [img.key]: true }))}
                        className="w-full aspect-square border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center gap-2 text-[#002395] text-sm font-medium"
                      >
                        <i className="fas fa-image"></i> View Photo
                      </button>
                    )
                  ) : (
                    <div className="w-full aspect-square flex items-center justify-center bg-[#f8fafc] text-[#64748b] rounded-xl border border-[#e2e8f0] border-dashed text-xs font-medium">No photo</div>
                  )}
                  <p className="text-xs font-semibold text-[#64748b] mt-2 text-center">{img.label}</p>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* LABEL ASSIGNMENT MODAL */}
        {showLabelDialog && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
            <div className="fixed inset-0" onClick={() => setShowLabelDialog(false)}></div>
            <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
              <h3 className="text-xl font-bold text-[#0f172a] mb-2">Assign Label Number</h3>
              <p className="text-[#64748b] text-sm mb-4">Assigning to <strong className="text-[#0f172a]">{mobile?.brand} {mobile?.model}</strong>.</p>
              <input type="number" inputMode="numeric" pattern="[0-9]*" value={labelInput} onChange={e => setLabelInput(e.target.value)} className="w-full border-2 border-[#e2e8f0] focus:border-[#002395] outline-none rounded-xl px-4 py-3 text-2xl font-bold text-center mb-6 text-[#0f172a]" />
              <div className="flex flex-col gap-3">
                <button onClick={confirmAssign} disabled={assigningLabel} className="w-full bg-[#002395] text-white py-3 rounded-xl font-bold hover:bg-[#001a7a] transition disabled:opacity-50">
                  {assigningLabel ? 'Assigning...' : `Confirm #${labelInput}`}
                </button>
                <button onClick={() => setShowLabelDialog(false)} className="w-full bg-white border-2 border-[#e2e8f0] text-[#64748b] py-3 rounded-xl font-bold hover:bg-gray-50 transition">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* EDIT MODAL */}
        {showEdit && (
          <SecondHandForm initialData={mobile} onSave={handleUpdate} onCancel={() => setShowEdit(false)} />
        )}

        {/* PRINTER SELECTOR */}
        <PrinterSelector
          isOpen={showPrinter}
          onClose={() => setShowPrinter(false)}
          htmlContent={labelHTML}
          labelEntry={labelEntry}
          title="Print Label"
        />

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

export default SecondHandView;
