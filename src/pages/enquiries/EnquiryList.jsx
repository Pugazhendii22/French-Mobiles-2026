import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { Link } from 'react-router-dom';
import Layout from '../../components/common/Layout';
import EnquiryForm from './EnquiryForm';
import { useAuth } from '../../context/AuthContext';

const EnquiryList = () => {
  const { userRole } = useAuth();
  const [enquiries, setEnquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [seriousnessFilter, setSeriousnessFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchEnquiries = async () => {
    try {
      const snap = await getDocs(collection(db, 'enquiries'));
      const list = [];
      snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setEnquiries(list);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { fetchEnquiries(); }, []);

  const handleSaveEnquiry = async (data) => {
    await addDoc(collection(db, 'enquiries'), data);
    setShowModal(false);
    fetchEnquiries();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'enquiries', deleteTarget.id));
      setEnquiries(prev => prev.filter(e => e.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) { console.error(err); }
    finally { setDeleting(false); }
  };

  const filteredEnquiries = enquiries.filter(e => {
    const q = searchQuery.replace(/\s+/g, '').toLowerCase();
    const matchesSearch = !searchQuery || 
      (e.customerName?.replace(/\s+/g, '').toLowerCase() || '').includes(q) ||
      (e.customerPhone?.replace(/\s+/g, '').toLowerCase() || '').includes(q) ||
      (e.modelEnquired?.replace(/\s+/g, '').toLowerCase() || '').includes(q);
    const matchesStatus = !statusFilter || e.status === statusFilter;
    const matchesSeriousness = !seriousnessFilter || e.seriousness === seriousnessFilter;
    return matchesSearch && matchesStatus && matchesSeriousness;
  });

  const statusColor = (s) => ({ Open: 'bg-blue-100 text-blue-800', 'Follow-up': 'bg-yellow-100 text-yellow-800', Converted: 'bg-green-100 text-green-800', Closed: 'bg-gray-100 text-gray-800' }[s] || 'bg-gray-100 text-gray-800');

  const fab = (
    <button
      onClick={() => setShowModal(true)}
      className="w-14 h-14 rounded-full bg-[#002395] text-white flex items-center justify-center hover:bg-[#001a7a] transition-all"
      style={{ boxShadow: '0 4px 12px rgba(0, 35, 149, 0.18)' }}
      aria-label="New Enquiry"
    >
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
    </button>
  );

return (
  <Layout title="Enquiries" fab={fab}>
    <div className="bg-[#f8fafc]">
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-[#0f172a]">Enquiries</h1>
          <span className="bg-[#002395] text-white text-xs font-bold px-2.5 py-1 rounded-full">
            {enquiries.length}
          </span>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="hidden md:flex items-center gap-2 bg-[#002395] text-white px-4 py-2 rounded-xl text-sm font-semibold"
        >
          <i className="fas fa-plus"></i> New Enquiry
        </button>
      </div>

    {/* SEARCH AND FILTERS */}
    <div className="px-4 pt-3 pb-2 space-y-2">
      <div className="relative">
        <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
        <input
          type="text"
          placeholder="Search by name, phone, model..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-[#002395] shadow-sm"
        />
      </div>
      <div className="flex gap-2">
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#002395]"
        >
          <option value="">All Status</option>
          <option value="Open">Open</option>
          <option value="Follow-up">Follow-up</option>
          <option value="Converted">Converted</option>
          <option value="Closed">Closed</option>
        </select>
        <select
          value={seriousnessFilter}
          onChange={e => setSeriousnessFilter(e.target.value)}
          className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#002395]"
        >
          <option value="">All Priority</option>
          <option value="Urgent">Urgent</option>
          <option value="Ordinary">Ordinary</option>
        </select>
      </div>
    </div>

    {/* ENQUIRY CARDS */}
    <div className="px-4 space-y-3">
      {filteredEnquiries.length === 0 ? (
        <div className="text-center py-16">
          <i className="fas fa-question-circle text-4xl text-gray-200 mb-3 block"></i>
          <p className="text-gray-400 text-sm">No enquiries found</p>
        </div>
      ) : (
        filteredEnquiries.map(enquiry => (
          <Link to={`/enquiries/${enquiry.id}`} className="block">
          <div
            className={`bg-white rounded-2xl border-l-4 shadow-sm p-4 cursor-pointer active:scale-95 transition ${
              enquiry.seriousness === 'Urgent' ? 'border-[#ED2939]' : 'border-[#002395]'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-[#0f172a] text-sm">{enquiry.customerName}</p>
                  {enquiry.seriousness === 'Urgent' && (
                    <span className="bg-[#ED2939]/10 text-[#ED2939] text-xs px-2 py-0.5 rounded-full font-medium">
                      Urgent
                    </span>
                  )}
                </div>
                <a href={`tel:${enquiry.customerPhone}`} className="text-green-600 text-xs mt-0.5 flex items-center">
                  <i className="fas fa-phone mr-1"></i>
                  {enquiry.customerPhone}
                </a>
                {enquiry.modelEnquired && (
                  <p className="text-[#002395] text-xs mt-1 font-medium">
                    <i className="fas fa-mobile-alt mr-1"></i>
                    {enquiry.modelEnquired}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {enquiry.budgetMin && (
                    <span className="text-xs text-gray-400">
                      ₹{enquiry.budgetMin}
                      {enquiry.budgetMax && ` - ₹${enquiry.budgetMax}`}
                    </span>
                  )}
                  {enquiry.medium && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      enquiry.medium === 'Walk-in' ? 'bg-[#002395]/10 text-[#002395]' :
                      enquiry.medium === 'Instagram' ? 'bg-pink-100 text-pink-700' :
                      enquiry.medium === 'YouTube' ? 'bg-red-100 text-[#ED2939]' :
                      enquiry.medium === 'Referral' ? 'bg-green-100 text-green-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {enquiry.medium}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  enquiry.status === 'Open' ? 'bg-[#002395]/10 text-[#002395]' :
                  enquiry.status === 'Follow-up' ? 'bg-orange-100 text-orange-700' :
                  enquiry.status === 'Converted' ? 'bg-green-100 text-green-700' :
                  'bg-gray-100 text-gray-500'
                }`}>
                  {enquiry.status}
                </span>
                <i className="fas fa-chevron-right text-gray-300 text-xs"></i>
              </div>
            </div>
          </div>
          </Link>
        ))
      )}
    </div>

    {/* ADD ENQUIRY MODAL */}
    {showModal && (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center">
        <div className="bg-white w-full md:max-w-2xl md:mx-auto rounded-t-3xl md:rounded-2xl flex flex-col max-h-[90vh]">
          <div className="md:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
            <div className="w-10 h-1 bg-gray-300 rounded-full"></div>
          </div>
          <div className="flex-shrink-0 px-4 pt-3 pb-3 border-b border-gray-100 bg-white">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#0f172a]">
                New Enquiry
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 p-1">
                <i className="fas fa-times text-lg"></i>
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <EnquiryForm
              initialData={null}
              onSave={handleSaveEnquiry}
              onCancel={() => setShowModal(false)}
            />
          </div>
        </div>
      </div>
    )}

    </div>
  </Layout>
);
};

export default EnquiryList;
