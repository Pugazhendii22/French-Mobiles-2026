import { useState, useEffect, useMemo } from 'react';
import { collection, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/shared/firebase/firebase';
import { useNavigate, useLocation } from 'react-router-dom';
import Layout from '@/shared/ui/Layout';
import SecondHandForm from './SecondHandForm';
import { useAuth } from '@/context/AuthContext';
import { loadCollection, invalidateCollection } from '@/shared/data/collectionCache';
import ConfirmDeleteModal from '@/shared/ui/ConfirmDeleteModal';
import { imageThumb } from '@/shared/lib/imageUrl';
import { describeFirebaseError } from '@/shared/firebase/firebaseError';
import { openWhatsApp as openWhatsAppChat, isWhatsAppReady } from '@/shared/lib/phone';
import { secondHandLabelData, syncLabelSnapshot } from '@/features/labels/data';
import { gradeOf } from '@/shared/ui/uiTokens';
import { useSheetDismiss } from '@/shared/ui/useSheetDismiss';
import { matchesQuery } from '@/shared/lib/searchMatch';
import NewSaleModal from '@/components/sales/NewSaleModal';

/* ─────────────────────────────────────────────
   SECOND-HAND STOCK

   A stock sheet, not a wall of cards. With a few hundred devices the job is
   finding one, so a row is kept to the height of its photo and the list reads
   as a single column of prices you can compare down the page.

   Two things carry meaning without being read, and both answer the same
   question - can I sell this:
     - the spine down the left of each row is green while the device is in
       stock and grey once it is sold;
     - a sold device recedes - its photo greys out and its price is struck -
       so what is still on the shelf is what stands out.

   The spine used to carry the condition grade, in four colours. Four colours
   with no key beside them read as decoration, and the grade is already spelled
   out in words under the model, where it can be understood.

   Red is used for exactly one thing here: deleting. It is not a decoration,
   a border, or a label for "sold".
────────────────────────────────────────────── */

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

/** "8 + 128" reads as one spec, the way staff say it out loud. */
const memoryOf = (m) => [m.ram, m.rom].filter(Boolean).join(' + ');

const SecondHandList = () => {
  const { userRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  /* Arriving from the scanner carries the scanned device in router state.
     Seeded at mount so the prefilled form is open on the first render rather
     than flashing the list first. */
  const [prefillData, setPrefillData] = useState(() => location.state || null);
  const [mobiles, setMobiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  /* Opens on what is still on the shelf. The job at the counter is finding
     something to sell, and sold devices are history - reachable in a tap, but
     not what the page should lead with. */
  const [filterStatus, setFilterStatus] = useState('available');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showModal, setShowModal] = useState(() => !!location.state);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [whatsAppDialog, setWhatsAppDialog] = useState({ open: false });
  const [loadError, setLoadError] = useState('');
  /* The device being sold, prefilled for the sale sheet. Null when closed. */
  const [sellTarget, setSellTarget] = useState(null);

  /* The WhatsApp confirmation is a sheet too - pull it down to skip sending. */
  const {
    sheetProps: waSheetProps, handleProps: waHandleProps, scrollRef: waScrollRef,
  } = useSheetDismiss({ onDismiss: () => setWhatsAppDialog({ open: false }) });

  const fetchMobiles = async () => {
    try {
      const list = await loadCollection('second_hand_mobiles');
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setMobiles(list);
    } catch (err) {
      console.error(err);
      setLoadError(describeFirebaseError(err));
    } finally { setLoading(false); }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchMobiles();
  }, []);

  // Drop the router state so going back or refreshing does not reopen the form.
  useEffect(() => {
    if (location.state) window.history.replaceState({}, document.title);
  }, [location.state]);

  const handleSaveMobile = async (data) => {
    const newMobile = { ...data, updatedAt: new Date().toISOString() };
    if (data.id) {
      const { id, ...updateData } = newMobile;
      await updateDoc(doc(db, 'second_hand_mobiles', id), updateData);
      invalidateCollection('second_hand_mobiles');
      fetchMobiles();
      // Keep any label printed for this mobile showing the edited details.
      await syncLabelSnapshot('second_hand', id, secondHandLabelData(updateData));
      return id;
    }
    newMobile.createdAt = new Date().toISOString();
    const docRef = await addDoc(collection(db, 'second_hand_mobiles'), newMobile);
    invalidateCollection('second_hand_mobiles');
    fetchMobiles();

    // Kept as entered - phone.js normalizes it when the link is built, and the
    // '+' of a foreign number must survive to reach the right country.
    const phone = (data.sellerPhone || data.sellerAlternatePhone || '').trim();
    if (phone) {
      const price = Number(data.purchasePrice || 0).toLocaleString('en-IN');
      const message = `Hi ${data.sellerName || ''}, thank you for handing over your ${data.brand} ${data.model} to French Mobiles. We have received it and paid Rs.${price} in full as agreed. This is a final sale - the device will not be returned. - French Mobiles`;
      setWhatsAppDialog({ open: true, phone, message, sellerName: data.sellerName });
    }

    return docRef.id;
  };

  const handleDeleteClick = (m) => {
    if (m.status === 'sold') {
      alert('Cannot delete a sold mobile.');
      return;
    }
    setDeleteTarget(m);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'second_hand_mobiles', deleteTarget.id));
      invalidateCollection('second_hand_mobiles');
      setMobiles(prev => prev.filter(m => m.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) { console.error(err); }
    finally { setDeleting(false); }
  };

  /* Opening the sale here rather than navigating to /sales. The Sell button
     sits inside a row, a thumb's width from the row itself, so it gets pressed
     by accident - and losing the whole list to another page over a mis-tap is a
     bad trade. A sheet over the list is dismissed by pulling it down, and the
     list is still underneath where it was left. */
  const sellMobile = (m) => {
    setSellTarget({
      items: [{
        type: 'Second-hand',
        itemId: m.id,
        name: `${m.brand} ${m.model}`,
        quantity: 1,
        unitPrice: Number(m.salePrice || 0),
        purchaseCost: Number(m.purchasePrice || 0),
        repairCost: Number(m.repairCost || 0),
        imei: m.imei1 || '',
      }],
    });
  };

  const filteredMobiles = useMemo(() => {
    return mobiles.filter(m => {
      if (filterStatus !== 'all' && (m.status || 'available') !== filterStatus) return false;

      /* The person is as good a handle on a device as the device itself:
         staff remember who they bought a phone from long before they remember
         which model it was. */
      const matchesSearch = matchesQuery(searchQuery, [
        m.brand, m.model, m.imei1, m.imei2, m.serialNumber,
        m.sellerName, m.sellerPhone, m.sellerAlternatePhone, m.supplier,
      ]);

      // Date filtering
      const mobileDate = m.createdAt ? new Date(m.createdAt) : null;
      const matchesFrom = !fromDate || (mobileDate && mobileDate >= new Date(fromDate));
      const matchesTo = !toDate || (mobileDate && mobileDate <= new Date(toDate + 'T23:59:59'));

      return matchesSearch && matchesFrom && matchesTo;
    });
  }, [mobiles, filterStatus, searchQuery, fromDate, toDate]);

  const counts = useMemo(() => {
    let available = 0;
    mobiles.forEach(m => { if ((m.status || 'available') === 'available') available += 1; });
    return { available, sold: mobiles.length - available };
  }, [mobiles]);

  /* Money still standing on the shelf. Only unsold devices count: adding up
     what sold ones were listed at would read as stock on hand and overstate it
     by every phone the shop has already turned over. */
  const stockValue = useMemo(
    () => filteredMobiles.reduce(
      (sum, m) => (m.status || 'available') === 'available' ? sum + (Number(m.salePrice) || 0) : sum,
      0,
    ),
    [filteredMobiles],
  );

  const fab = (
    <button
      onClick={() => setShowModal(true)}
      className="w-14 h-14 rounded-full bg-[#002395] text-white flex items-center justify-center"
      style={{ boxShadow: '0 6px 18px rgba(0, 35, 149, 0.35)' }}
      aria-label="Add a mobile"
    >
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/></svg>
    </button>
  );

  useEffect(() => {
    document.body.style.overflow = (showModal || deleteTarget) ? 'hidden' : 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [showModal, deleteTarget]);
  /* The sale sheet locks scrolling itself, so it is deliberately not listed
     above - both effects writing the same style fought each other on close. */

  const dateFilterActive = Boolean(fromDate || toDate);
  const TABS = [
    { key: 'all', label: 'All', count: mobiles.length },
    { key: 'available', label: 'In stock', count: counts.available },
    { key: 'sold', label: 'Sold', count: counts.sold },
  ];

  return (
    <Layout title="Second-Hand Inventory" pageType="list" fab={fab}>
      <div className="max-w-3xl mx-auto">

        {loadError && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 mb-3">
            <p className="text-sm font-bold text-[#ED2939]">Could not load the stock list</p>
            <p className="text-xs text-[#7a1520] mt-1 leading-relaxed">{loadError}</p>
          </div>
        )}

        {/* Find a phone. Everything above the list exists for this one job. */}
        <div className="relative mb-2.5">
          <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-[#94a3b8] text-sm" aria-hidden="true"></i>
          <input
            id="secondhand-search"
            type="text"
            placeholder="Search by brand, model, IMEI, name or number"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-10 py-3 bg-white border border-[#E6EAF0] focus:border-[#002395] rounded-xl focus:outline-none text-[15px] text-[#0F172A] placeholder:text-[#94a3b8]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full text-[#94a3b8] flex items-center justify-center"
              aria-label="Clear search"
            >
              <i className="fas fa-times text-sm"></i>
            </button>
          )}
        </div>

        {/* The count lives in the tab, so the shelf is legible before you read. */}
        <div className="flex gap-1.5 mb-2.5" role="tablist">
          {TABS.map(t => {
            const on = filterStatus === t.key;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={on}
                onClick={() => setFilterStatus(t.key)}
                className={`flex-1 py-2 rounded-xl text-[13px] font-semibold border transition-colors ${
                  on
                    ? 'bg-[#002395] text-white border-[#002395]'
                    : 'bg-white text-[#475569] border-[#E6EAF0]'
                }`}
              >
                {t.label}
                <span className={`ml-1.5 tabular-nums ${on ? 'text-white/70' : 'text-[#94a3b8]'}`}>
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between px-0.5 mb-2">
          <p className="text-[13px] text-[#64748B]">
            {loading
              ? 'Loading stock…'
              : <>Showing <span className="font-semibold text-[#0F172A] tabular-nums">{filteredMobiles.length}</span>
                  {' · '}
                  <span className="font-semibold text-[#0F172A] tabular-nums">{money(stockValue)}</span>
                  {' still in stock'}</>}
          </p>
          <button
            onClick={() => setShowFilters(p => !p)}
            className={`text-[13px] font-semibold ${dateFilterActive ? 'text-[#002395]' : 'text-[#64748B]'}`}
          >
            {dateFilterActive ? 'Dates on' : 'Dates'}
          </button>
        </div>

        {showFilters && (
          <div className="bg-white border border-[#E6EAF0] rounded-xl p-3 mb-2.5">
            <div className="flex gap-2">
              <label className="flex-1 text-[12px] text-[#64748B]">
                From
                <input
                  type="date"
                  value={fromDate}
                  onChange={e => setFromDate(e.target.value)}
                  className="mt-1 w-full border border-[#E6EAF0] rounded-lg px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:border-[#002395]"
                />
              </label>
              <label className="flex-1 text-[12px] text-[#64748B]">
                To
                <input
                  type="date"
                  value={toDate}
                  onChange={e => setToDate(e.target.value)}
                  className="mt-1 w-full border border-[#E6EAF0] rounded-lg px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:border-[#002395]"
                />
              </label>
            </div>
            {dateFilterActive && (
              <button
                onClick={() => { setFromDate(''); setToDate(''); }}
                className="mt-2 text-[13px] font-semibold text-[#002395]"
              >
                Clear dates
              </button>
            )}
          </div>
        )}

        {/* One sheet, hairline-separated. Rows are the height of their photo. */}
        {loading ? (
          <div className="bg-white border border-[#E6EAF0] rounded-xl overflow-hidden">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5 border-b border-[#F1F4F9] last:border-0">
                <div className="w-11 h-11 rounded-lg bg-[#F1F4F9] animate-pulse shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-2/5 bg-[#F1F4F9] rounded animate-pulse" />
                  <div className="h-2.5 w-1/4 bg-[#F1F4F9] rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredMobiles.length === 0 ? (
          <div className="bg-white border border-[#E6EAF0] rounded-xl px-6 py-14 text-center">
            <p className="text-[15px] font-semibold text-[#0F172A]">
              {mobiles.length === 0 ? 'No mobiles in stock yet' : 'Nothing matches that'}
            </p>
            <p className="text-[13px] text-[#64748B] mt-1 leading-relaxed">
              {mobiles.length === 0
                ? 'Use the + button to add the first device you buy in.'
                : 'Try a shorter search, or switch the tab above.'}
            </p>
            {mobiles.length > 0 && (searchQuery || dateFilterActive || filterStatus !== 'all') && (
              <button
                onClick={() => { setSearchQuery(''); setFromDate(''); setToDate(''); setFilterStatus('all'); }}
                className="mt-4 text-[13px] font-semibold text-[#002395]"
              >
                Clear search and filters
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white border border-[#E6EAF0] rounded-xl overflow-hidden">
            {filteredMobiles.map(m => {
              const sold = (m.status || 'available') === 'sold';
              const grade = gradeOf(m.condition);
              return (
                <div
                  key={m.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/inventory/second-hand/${m.id}`)}
                  onKeyDown={e => { if (e.key === 'Enter') navigate(`/inventory/second-hand/${m.id}`); }}
                  className="relative flex items-center gap-3 pl-4 pr-3 py-2.5 border-b border-[#F1F4F9] last:border-0 cursor-pointer active:bg-[#F8FAFC] focus:outline-none focus:bg-[#F1F4F9]"
                >
                  {/* Green down the left means it is still on the shelf, grey
                      means it is gone. Two colours, one question. */}
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-0 bottom-0 w-[3px]"
                    style={{ background: sold ? '#CBD5E1' : '#16a34a' }}
                  />

                  <div className={`w-11 h-11 rounded-lg bg-[#F8FAFC] border border-[#F1F4F9] shrink-0 overflow-hidden flex items-center justify-center ${sold ? 'grayscale opacity-50' : ''}`}>
                    {m.photo1Url
                      ? <img src={imageThumb(m.photo1Url, 88)} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                      : <i className="fas fa-mobile-alt text-[#cbd5e1]" aria-hidden="true"></i>}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className={`text-[15px] font-semibold leading-tight truncate ${sold ? 'text-[#94a3b8]' : 'text-[#0F172A]'}`}>
                      {m.brand} {m.model}
                    </p>
                    <p className="text-[12px] text-[#64748B] leading-tight mt-0.5 truncate">
                      {[memoryOf(m), grade.label].filter(Boolean).join(' · ')}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className={`text-[15px] font-bold tabular-nums leading-tight ${sold ? 'text-[#94a3b8] line-through' : 'text-[#0F172A]'}`}>
                      {money(m.salePrice)}
                    </p>
                    {sold ? (
                      <p className="text-[11px] font-semibold text-[#94a3b8] mt-1">Sold</p>
                    ) : (
                      <button
                        onClick={e => { e.stopPropagation(); sellMobile(m); }}
                        className="mt-1 bg-[#16a34a] text-white text-[12px] font-semibold px-3 py-1 rounded-lg"
                      >
                        Sell
                      </button>
                    )}
                  </div>

                  {userRole === 'admin' && !sold && (
                    <button
                      onClick={e => { e.stopPropagation(); handleDeleteClick(m); }}
                      className="shrink-0 w-8 h-8 -mr-1 rounded-lg text-[#cbd5e1] flex items-center justify-center active:text-[#ED2939]"
                      aria-label={`Delete ${m.brand} ${m.model}`}
                    >
                      <i className="fas fa-trash text-[11px]" aria-hidden="true"></i>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {showModal && (
          <SecondHandForm
            prefillData={prefillData}
            onSave={handleSaveMobile}
            onCancel={() => { setShowModal(false); setPrefillData(null); }}
          />
        )}

        {/* Selling happens over the list, not on another page. */}
        {sellTarget && (
          <NewSaleModal
            prefillData={sellTarget}
            onClose={() => setSellTarget(null)}
            onSuccess={() => { invalidateCollection('second_hand_mobiles'); fetchMobiles(); }}
          />
        )}
        <ConfirmDeleteModal
          isOpen={!!deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          deleting={deleting}
          title="Delete this mobile?"
          message={deleteTarget ? `${deleteTarget.brand} ${deleteTarget.model} will be removed from stock. This cannot be undone.` : ''}
        />

        {/* ── WHATSAPP PURCHASE CONFIRMATION ── */}
        {whatsAppDialog.open && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center animate-fade-in">
            <div
              {...waSheetProps}
              className="bg-white w-full md:max-w-lg md:mx-auto rounded-t-3xl md:rounded-2xl flex flex-col max-h-[90dvh] overflow-hidden pb-safe"
            >
              <div
                {...waHandleProps}
                aria-label="Drag down to close"
                className="md:hidden flex justify-center pt-2.5 pb-2 flex-shrink-0"
              >
                <div className="w-10 h-1 bg-gray-300 rounded-full"></div>
              </div>
              <div className="flex-shrink-0 px-4 pt-2 pb-3 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-[#0f172a]">Send WhatsApp Confirmation</h2>
                  <p className="text-xs text-gray-400">
                    To <span className="font-bold text-[#002395]">{whatsAppDialog.sellerName || 'seller'}</span>
                  </p>
                </div>
                <button onClick={() => setWhatsAppDialog({ open: false })} className="w-10 h-10 rounded-full flex items-center justify-center text-gray-400" aria-label="Close">
                  <i className="fas fa-times text-lg"></i>
                </button>
              </div>
              <div ref={waScrollRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-3">
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-gray-700 whitespace-pre-wrap">
                  {whatsAppDialog.message}
                </div>
                <a href={`tel:${whatsAppDialog.phone}`} className="text-xs text-green-600 font-semibold">
                  Sending to {whatsAppDialog.phone}
                </a>
                {!isWhatsAppReady(whatsAppDialog.phone) && (
                  <p className="text-xs text-[#ED2939] font-semibold">
                    WhatsApp will not accept this number. Edit the purchase and save a valid 10-digit mobile number.
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

export default SecondHandList;
