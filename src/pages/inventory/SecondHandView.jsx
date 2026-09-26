import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../../firebase/firebase';
import { useSettings } from '../../context/SettingsContext';
import SecondHandForm from './SecondHandForm';
import { getLabelNumber } from '../../utils/getLabelNumber';
import { generateLabelHTML } from '../../utils/printLabel.jsx';
import PrinterSelector from '../../components/PrinterSelector';
import Layout from '../../components/common/Layout';
import ImageModal from '../../components/common/ImageModal';
import { useAuth } from '../../context/AuthContext';
import { invalidateCollection } from '../../utils/collectionCache';
import { Section, InfoRow, InfoGrid, Chip, MoneyRow } from '../../components/common/ui';
import { gradeColor } from '../../components/common/uiTokens';
import { generateSecondHandPurchaseForm } from '../../utils/generateSecondHandPurchaseForm';
import { imageThumb } from '../../utils/imageUrl';

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
  const { deviceChecklist, shopDetails } = useSettings();
  const { userRole, userName } = useAuth();
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
    if ((mobile?.status === 'sold' || mobile?.status === 'Completed') && userRole?.toLowerCase() !== 'admin') {
      alert('This mobile is sold and locked. Only admins can modify it.');
      return;
    }
    const updated = { ...data, updatedAt: new Date().toISOString() };
    await updateDoc(doc(db, 'second_hand_mobiles', id), updated);
    invalidateCollection('second_hand_mobiles');
    setMobile({ id, ...updated });
    return id;
  };

  // The signed declaration the seller leaves with - reprintable if it is lost
  const handlePrintPurchaseForm = () => {
    const html = generateSecondHandPurchaseForm(mobile, shopDetails, {}, userName || '');
    const printWindow = window.open('', '_blank');
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
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

  if (loading) return (
    <Layout title="Second-Hand Detail" pageType="detail" backTo="/inventory/second-hand">
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => <div key={i} className="bg-white rounded-2xl h-32 animate-pulse" />)}
      </div>
    </Layout>
  );

  if (!mobile) return (
    <Layout title="Second-Hand Detail" pageType="detail" backTo="/inventory/second-hand">
      <div className="text-center py-16 bg-white rounded-2xl border border-[#e2e8f0]">
        <i className="fas fa-mobile-alt text-4xl text-gray-200 mb-3 block"></i>
        <p className="text-gray-500 font-semibold text-sm">Mobile not found</p>
      </div>
    </Layout>
  );

  const isAvailable = mobile?.status === 'available' || !mobile?.status;
  const canEdit = userRole?.toLowerCase() === 'admin' || isAvailable;
  const heroPhoto = mobile?.photo1Url || mobile?.frontImageUrl;

  return (
    <Layout title="Second-Hand Detail" pageType="detail" backTo="/inventory/second-hand">
      <div className="max-w-3xl mx-auto space-y-3">

        {/* ── HERO ── */}
        <div className={`bg-white rounded-2xl shadow-sm border-l-4 p-4 ${
          mobile?.condition === 'A' ? 'border-green-500' :
          mobile?.condition === 'B' ? 'border-[#002395]' :
          mobile?.condition === 'C' ? 'border-orange-500' :
          'border-[#ED2939]'
        }`}>
          <div className="flex gap-3">
            <div className="w-20 h-20 rounded-xl bg-gray-50 border border-gray-100 shrink-0 overflow-hidden flex items-center justify-center">
              {heroPhoto ? (
                <img
                  src={imageThumb(heroPhoto, 80)}
                  loading="lazy"
                  decoding="async"
                  alt={`${mobile?.brand} ${mobile?.model}`}
                  className="w-full h-full object-cover cursor-pointer"
                  onClick={() => {
                    setViewerUrl(heroPhoto);
                    setViewerTitle(`${mobile?.brand} ${mobile?.model}`);
                    setViewerOpen(true);
                  }}
                />
              ) : (
                <i className="fas fa-mobile-alt text-gray-300 text-2xl"></i>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-lg font-bold text-[#0f172a] leading-tight">
                  {mobile?.brand} {mobile?.model}
                </h2>
                <p className="text-xl font-bold text-[#002395] shrink-0 leading-tight">₹{mobile?.salePrice}</p>
              </div>
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <Chip className={gradeColor(mobile?.condition)}>Grade {mobile?.condition}</Chip>
                {mobile?.ram && <Chip className="bg-[#002395]/10 text-[#002395]">{mobile?.ram}</Chip>}
                {mobile?.rom && <Chip className="bg-gray-100 text-gray-600">{mobile?.rom}</Chip>}
                <Chip className={isAvailable ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>
                  {isAvailable ? 'Available' : 'Sold'}
                </Chip>
                {labelEntry && (
                  <Chip className="bg-[#002395]/10 text-[#002395]">
                    <i className="fas fa-tag mr-1"></i>#{labelEntry.labelNumber}
                  </Chip>
                )}
              </div>
              {mobile?.purchasePrice && (
                <p className="text-[11px] text-gray-400 mt-1.5">Cost ₹{mobile?.purchasePrice}</p>
              )}
            </div>
          </div>

          {/* ── ACTIONS ── */}
          <div className="mt-4 pt-3 border-t border-gray-100 space-y-2">
            {isAvailable && (
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
                className="w-full bg-green-600 text-white py-3 rounded-xl text-sm font-bold"
              >
                <i className="fas fa-cart-plus mr-2"></i>Sell Mobile
              </button>
            )}

            <button
              onClick={handlePrintPurchaseForm}
              className="w-full bg-amber-50 text-amber-700 py-2.5 rounded-xl text-xs font-bold"
            >
              <i className="fas fa-file-signature mr-1.5"></i>Print Purchase Declaration
            </button>

            <div className="flex gap-2">
              {canEdit && (
                <button
                  onClick={() => setShowEdit(true)}
                  className="flex-1 bg-[#002395]/10 text-[#002395] py-2.5 rounded-xl text-xs font-bold"
                >
                  <i className="fas fa-edit mr-1.5"></i>Edit
                </button>
              )}
              {labelEntry ? (
                <button
                  onClick={() => {
                    const html = generateLabelHTML(labelEntry)
                    setLabelHTML(html)
                    setShowPrinter(true)
                  }}
                  className="flex-1 bg-[#ED2939]/10 text-[#ED2939] py-2.5 rounded-xl text-xs font-bold"
                >
                  <i className="fas fa-print mr-1.5"></i>Print #{labelEntry.labelNumber}
                </button>
              ) : canEdit ? (
                <button
                  onClick={openLabelDialog}
                  className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-xl text-xs font-bold"
                >
                  <i className="fas fa-tag mr-1.5"></i>Assign Label
                </button>
              ) : null}
            </div>

            {!isAvailable && userRole?.toLowerCase() !== 'admin' && (
              <p className="flex items-center justify-center gap-1.5 bg-gray-100 text-gray-500 py-2.5 rounded-xl text-xs font-semibold">
                <i className="fas fa-lock"></i> Sold - locked (admin only)
              </p>
            )}
          </div>
        </div>

        {/* ── COST & PROFIT ── */}
        <Section icon="fa-indian-rupee-sign" title="Cost & Profit">
          <MoneyRow label="Purchase Price" value={`₹${mobile?.purchasePrice || 0}`} />
          {mobile?.wasRepaired && mobile?.repairCost > 0 && (
            <MoneyRow label="Repair Cost" value={`₹${mobile?.repairCost}`} tone="bad" />
          )}
          <MoneyRow label="Total Cost" value={`₹${mobile?.totalCost || mobile?.purchasePrice || 0}`} divider />
          <MoneyRow label="Sale Price" value={`₹${mobile?.salePrice || 0}`} />
          <MoneyRow
            label="Profit"
            value={`₹${mobile?.profit || 0}`}
            strong
            divider
            tone={(mobile?.profit || 0) >= 0 ? 'good' : 'bad'}
          />
        </Section>

        {/* ── DEVICE INFO ── */}
        <Section icon="fa-circle-info" title="Device Info">
          <InfoGrid>
            <InfoRow label="IMEI 1" value={mobile?.imei1} mono />
            <InfoRow label="IMEI 2" value={mobile?.imei2} mono />
            <InfoRow label="Serial Number" value={mobile?.serialNumber} mono />
            <InfoRow label="Purchase Date" value={mobile?.purchaseDate} />
            <InfoRow label="Supplier" value={mobile?.supplier} />
          </InfoGrid>
          {mobile?.notes && (
            <div className="mt-3">
              <p className="text-[11px] text-gray-400 mb-1">Notes</p>
              <p className="text-sm text-gray-600 bg-gray-50 rounded-xl p-3">{mobile?.notes}</p>
            </div>
          )}
        </Section>

        {/* ── CHECKLIST ── */}
        {mobile?.conditionChecklist && (() => {
          const isApple = mobile?.brand?.toLowerCase() === 'apple'
          const specificItems = isApple
            ? (deviceChecklist.iphone || [])
            : (deviceChecklist.android || [])
          const commonItems = deviceChecklist.common || []

          const renderGroup = (grouped, accent) => (
            <div className="space-y-3">
              {Object.entries(grouped).map(([category, items]) => {
                const rows = items.map((item, idx) => {
                  const key = item.label.replace(/\s+/g, '_').toLowerCase()
                  const value = mobile?.conditionChecklist?.[key]
                  if (!value) return null
                  const isGood = value === 'Working' || value === 'No'
                  return (
                    <div key={idx} className="flex items-center gap-2 min-w-0">
                      <i className={`fas ${isGood ? 'fa-check-circle text-green-500' : 'fa-times-circle text-[#ED2939]'} text-sm flex-shrink-0`}></i>
                      <span className="text-xs text-gray-600 truncate">{item.label}</span>
                    </div>
                  )
                }).filter(Boolean)
                if (rows.length === 0) return null
                return (
                  <div key={category} className="bg-gray-50/70 rounded-xl p-3">
                    <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${accent}`}>{category}</p>
                    <div className="grid grid-cols-2 gap-2">{rows}</div>
                  </div>
                )
              })}
            </div>
          )

          const groupedCommon = groupByCategory(commonItems)
          const groupedSpecific = groupByCategory(specificItems)

          return (
            <Section
              icon="fa-clipboard-check"
              title="Device Checklist"
              action={
                <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg shrink-0 ${
                  isApple ? 'bg-gray-100 text-gray-700' : 'bg-green-50 text-green-700'
                }`}>
                  <i className={`fab ${isApple ? 'fa-apple' : 'fa-android'} text-xs`}></i>
                  <span className="text-[10px] font-bold">{isApple ? 'iPhone' : 'Android'}</span>
                </span>
              }
            >
              <div className="space-y-4">
                {Object.keys(groupedCommon).length > 0 && (
                  <div>
                    <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">Common Checks</p>
                    {renderGroup(groupedCommon, 'text-gray-400')}
                  </div>
                )}
                {Object.keys(groupedSpecific).length > 0 && (
                  <div>
                    <p className="text-[11px] font-bold text-[#002395] uppercase tracking-wide mb-2">
                      {isApple ? 'iPhone Specific' : 'Android Specific'}
                    </p>
                    {renderGroup(groupedSpecific, 'text-[#002395]/70')}
                  </div>
                )}
              </div>
            </Section>
          )
        })()}

        {/* ── REPAIR ── */}
        {mobile?.wasRepaired && (
          <Section icon="fa-screwdriver-wrench" title="Repair & Refurbishment" tone="danger">
            <div className="space-y-2 mb-3">
              {mobile?.repairItems?.map((item, index) => (
                <div key={index} className="bg-gray-50 rounded-xl p-3 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#0f172a]">{item.description}</p>
                    <div className="flex flex-wrap gap-x-3 mt-0.5">
                      {item.technician && (
                        <p className="text-[11px] text-gray-400"><i className="fas fa-user mr-1"></i>{item.technician}</p>
                      )}
                      {item.date && (
                        <p className="text-[11px] text-gray-400"><i className="fas fa-calendar mr-1"></i>{item.date}</p>
                      )}
                    </div>
                  </div>
                  <p className="text-sm font-bold text-[#ED2939] shrink-0">₹{item.cost}</p>
                </div>
              ))}
            </div>
            <div className="bg-[#ED2939]/5 rounded-xl p-3 border border-[#ED2939]/20">
              <div className="flex justify-between text-sm font-bold text-[#ED2939]">
                <span>Total Repair Cost</span>
                <span>₹{mobile?.repairCost}</span>
              </div>
            </div>
          </Section>
        )}

        {/* ── SELLER ── */}
        {mobile?.sellerCustomerId && (
          <Section icon="fa-user" title="Seller">
            <InfoGrid>
              <InfoRow label="Name" value={mobile?.sellerName} />
              <InfoRow label="Phone" value={mobile?.sellerPhone} href={`tel:${mobile?.sellerPhone}`} />
            </InfoGrid>
            <button
              onClick={() => navigate(`/customers/${mobile?.sellerCustomerId}`)}
              className="w-full mt-3 bg-[#002395]/10 text-[#002395] py-2.5 rounded-xl text-xs font-bold"
            >
              <i className="fas fa-user mr-1.5"></i>View Customer Profile
            </button>
          </Section>
        )}

        {/* ── SELLER AGREEMENT ── */}
        {(mobile?.sellerSignatureUrl || mobile?.agreementAcceptedAt) && (
          <Section icon="fa-file-signature" title="Seller Agreement" tone="danger">
            {mobile?.sellerSignatureUrl && (
              <div className="border border-[#e2e8f0] rounded-xl bg-white p-2">
                <img
                  src={mobile.sellerSignatureUrl}
                  alt="Seller signature"
                  loading="lazy"
                  decoding="async"
                  className="w-full h-24 object-contain cursor-pointer"
                  onClick={() => {
                    setViewerUrl(mobile.sellerSignatureUrl);
                    setViewerTitle('Seller signature');
                    setViewerOpen(true);
                  }}
                />
              </div>
            )}
            <div className="mt-2 space-y-1">
              {mobile?.agreementAcceptedAt && (
                <p className="text-[11px] text-gray-500">
                  Signed {new Date(mobile.agreementAcceptedAt).toLocaleString('en-IN')}
                </p>
              )}
              <p className={`text-[11px] font-semibold ${mobile?.sellerIdVerified ? 'text-green-700' : 'text-[#ED2939]'}`}>
                <i className={`fas ${mobile?.sellerIdVerified ? 'fa-check-circle' : 'fa-exclamation-circle'} mr-1`}></i>
                {mobile?.sellerIdVerified ? 'Original photo ID checked by staff' : 'ID not confirmed'}
              </p>
            </div>
          </Section>
        )}

        {/* ── PHOTOS ── */}
        <Section icon="fa-camera" title="Photos & Documents" hint="Tap a photo to open it full screen">
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { label: 'Front', url: mobile?.photo1Url || mobile?.frontImageUrl, key: 'photo1' },
              { label: 'Back',  url: mobile?.photo2Url || mobile?.backImageUrl, key: 'photo2' },
              { label: 'Left',  url: mobile?.photo3Url, key: 'photo3' },
              { label: 'Right', url: mobile?.photo4Url, key: 'photo4' },
              { label: 'Top/Bottom', url: mobile?.photo5Url, key: 'photo5' },
              { label: 'Additional', url: mobile?.photo6Url, key: 'photo6' },
              { label: 'ID Front',   url: mobile?.idCardFrontUrl, key: 'idFront' },
              { label: 'ID Back',    url: mobile?.idCardBackUrl, key: 'idBack' },
            ].map((img, idx) => (
              <div key={idx}>
                {img.url ? (
                  showImage[img.key] ? (
                    <div className="relative w-full aspect-square">
                      <img
                        src={imageThumb(img.url, 120)}
                        loading="lazy"
                        decoding="async"
                        alt={img.label}
                        className="w-full h-full object-cover rounded-xl border border-[#e2e8f0] cursor-pointer"
                        onClick={() => {
                          setViewerUrl(img.url);
                          setViewerTitle(`${mobile?.brand} ${mobile?.model} - ${img.label}`);
                          setViewerOpen(true);
                        }}
                      />
                      <button
                        onClick={() => setShowImage(prev => ({ ...prev, [img.key]: false }))}
                        className="absolute top-1 right-1 bg-black/60 text-white w-6 h-6 rounded-full text-[10px] flex items-center justify-center"
                        aria-label={`Hide ${img.label}`}
                      >
                        <i className="fas fa-eye-slash"></i>
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowImage(prev => ({ ...prev, [img.key]: true }))}
                      className="w-full aspect-square border-2 border-dashed border-[#002395]/30 bg-[#002395]/5 rounded-xl flex flex-col items-center justify-center text-[#002395]"
                    >
                      <i className="fas fa-image text-lg"></i>
                      <span className="text-[10px] font-bold mt-1">View</span>
                    </button>
                  )
                ) : (
                  <div className="w-full aspect-square flex items-center justify-center bg-[#f8fafc] text-gray-300 rounded-xl border border-dashed border-[#e2e8f0]">
                    <i className="fas fa-image text-lg"></i>
                  </div>
                )}
                <p className="text-[10px] font-semibold text-[#64748b] mt-1.5 text-center truncate">{img.label}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ── LABEL ASSIGNMENT ── */}
        {showLabelDialog && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 overflow-y-auto animate-fade-in">
            <div className="fixed inset-0" onClick={() => setShowLabelDialog(false)}></div>
            <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full p-5">
              <h3 className="text-lg font-bold text-[#0f172a] mb-1">Assign Label Number</h3>
              <p className="text-[#64748b] text-sm mb-4">
                For <strong className="text-[#0f172a]">{mobile?.brand} {mobile?.model}</strong>
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
                <button onClick={confirmAssign} disabled={assigningLabel} className="w-full bg-[#002395] text-white py-3 rounded-xl font-bold text-sm disabled:opacity-50">
                  {assigningLabel ? 'Assigning...' : `Confirm #${labelInput}`}
                </button>
                <button onClick={() => setShowLabelDialog(false)} className="w-full border border-gray-200 text-gray-600 py-3 rounded-xl font-bold text-sm">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {showEdit && (
          <SecondHandForm initialData={mobile} onSave={handleUpdate} onCancel={() => setShowEdit(false)} />
        )}

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
