import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import Layout from '../../components/common/Layout';
import { generateLabelHTML } from '../../utils/printLabel.jsx';
import PrinterSelector from '../../components/PrinterSelector';
import { useAuth } from '../../context/AuthContext';
import ConfirmDeleteModal from '../../components/ConfirmDeleteModal';

const LabelRegistryList = () => {
  const { userRole } = useAuth();
  const [labels, setLabels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingLabel, setEditingLabel] = useState(null);
  const [newLabelNum, setNewLabelNum] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [showPrinter, setShowPrinter] = useState(false);
  const [labelHTML, setLabelHTML] = useState('');
  const [labelEntry, setLabelEntry] = useState(null);

  const fetchLabels = async () => {
    try {
      const snap = await getDocs(collection(db, 'label_registry'));
      const list = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() }));
      list.sort((a, b) => b.labelNumber - a.labelNumber);
      setLabels(list);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { fetchLabels(); }, []);

  const handleEditClick = (lbl) => { setEditingLabel(lbl); setNewLabelNum(lbl.labelNumber); };

  const handleUpdateNumber = async () => {
    try {
      await updateDoc(doc(db, 'label_registry', editingLabel.id), { labelNumber: Number(newLabelNum) });
      setEditingLabel(null);
      fetchLabels();
    } catch (err) { console.error(err); alert('Failed to update label number'); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'label_registry', deleteTarget.id));
      setLabels(prev => prev.filter(l => l.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) { console.error(err); }
    finally { setDeleting(false); }
  };

  const filteredLabels = labels.filter(l => !searchQuery || String(l.labelNumber).includes(searchQuery));
  return (
    <Layout title="Label Registry" pageType="list">
      <div className="flex-1 min-w-0">
        <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0f172a]">Label Registry</h1>
            <p className="text-sm text-[#64748b] mt-1">Track label assignments with a clean registry view.</p>
          </div>
          <div className="rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] px-4 py-3 text-sm text-[#0f172a]">
            {labels.length} labels available
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-[#e2e8f0] p-4 mb-6 break-words">
          <div className="flex flex-col md:flex-row items-center gap-3">
            <input
              type="text"
              placeholder="Search by Label Number..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="flex-1 border-2 border-[#e2e8f0] focus:border-[#002395] rounded-2xl px-4 py-3 text-sm text-[#0f172a] outline-none transition-colors"
            />
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="bg-white rounded-lg h-14 animate-pulse break-words" />)}</div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-[#e2e8f0] overflow-hidden break-words">
            <div className="divide-y divide-gray-100">
              {filteredLabels.map(l => (
                <div key={l.id} className="flex flex-col md:flex-row items-center justify-between gap-3 px-5 py-4 hover:bg-gray-50 transition-colors break-words">
                  <div>
                    <p className="text-sm font-semibold text-[#002395]">#{l.labelNumber}</p>
                    <p className="text-xs text-[#64748b] mt-1">{(l.labelType || '').replace('_', ' ')}</p>
                  </div>
                  <div className="text-sm text-[#0f172a] font-medium">
                    {l.labelType === 'second_hand' && `${l.data?.brand || ''} ${l.data?.model || ''}`}
                    {l.labelType === 'service_order' && `${l.data?.orderNumber || ''} - ${l.data?.customerName || ''}`}
                    {l.labelType === 'product' && `${l.data?.productName || ''}`}
                    {l.labelType === 'sale' && `${l.data?.invoiceNumber || ''}`}
                  </div>
                  <div className="text-xs text-[#64748b] whitespace-nowrap">{l.assignedAt ? new Date(l.assignedAt).toLocaleDateString() : '-'}</div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <button onClick={() => {
                      const html = generateLabelHTML(l)
                      setLabelHTML(html)
                      setLabelEntry(l)
                      setShowPrinter(true)
                    }} className="bg-[#002395] text-white px-3 py-2 rounded-2xl text-xs font-semibold hover:bg-[#001a7a] transition-colors">Print</button>
                    <button onClick={() => handleEditClick(l)} className="border border-[#e2e8f0] text-[#002395] px-3 py-2 rounded-2xl text-xs font-semibold hover:bg-blue-50 transition-colors">Edit</button>
                    {userRole === 'admin' && (
                      <button
                        onClick={() => setDeleteTarget(l)}
                        title="Delete label"
                        className="text-[#ED2939] hover:bg-red-50 px-3 py-2 rounded-2xl text-xs font-semibold transition-colors"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {editingLabel && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-4">
            <div className="bg-white w-full md:max-w-lg rounded-t-3xl md:rounded-2xl overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between px-5 py-4 bg-[#002395] text-white">
                <h2 className="text-lg font-bold">Edit Label Number</h2>
                <button onClick={() => setEditingLabel(null)} className="p-2 rounded-full hover:bg-white/20 transition">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-[#0f172a] mb-1">Label Number</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={newLabelNum}
                    onChange={e => setNewLabelNum(e.target.value)}
                    className="w-full rounded-2xl border border-[#e2e8f0] px-4 py-3 text-sm text-[#0f172a] focus:border-[#002395] focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 border-t border-[#e2e8f0] bg-[#f8fafc]">
                <button
                  onClick={() => setEditingLabel(null)}
                  className="flex-1 rounded-2xl border border-[#d1d5db] py-3 text-sm font-semibold text-[#64748b] hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateNumber}
                  className="flex-1 rounded-2xl bg-[#002395] py-3 text-sm font-semibold text-white hover:bg-[#001a7a]"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
        <ConfirmDeleteModal
          isOpen={!!deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          deleting={deleting}
          title="Delete Label"
          message="Are you sure you want to delete this label entry? This action cannot be undone."
        />

        <PrinterSelector
          isOpen={showPrinter}
          onClose={() => setShowPrinter(false)}
          htmlContent={labelHTML}
          labelEntry={labelEntry}
          title="Print Label"
        />
      </div>
    </Layout>
  );
};

export default LabelRegistryList;
