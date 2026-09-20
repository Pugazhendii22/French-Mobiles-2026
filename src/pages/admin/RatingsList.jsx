import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import Layout from '../../components/common/Layout';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import ConfirmDeleteModal from '../../components/ConfirmDeleteModal';

const RatingsList = () => {
  const { userRole } = useAuth();
  const [ratings, setRatings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRating, setFilterRating] = useState('All');
  const [filterTechnician, setFilterTechnician] = useState('All');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchRatings();
  }, []);

  const fetchRatings = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'ratings'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setRatings(list);
    } catch (err) {
      console.error("Error fetching ratings:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'ratings', deleteTarget.id));
      setRatings(prev => prev.filter(r => r.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) { console.error(err); }
    finally { setDeleting(false); }
  };

  // Get unique technicians for filter dropdown
  const technicians = [...new Set(ratings.map(r => r.technicianName).filter(Boolean))];

  const filteredRatings = ratings.filter(r => {
    // Filter by tab status
    const isSubmitted = r.submittedAt || r.status === 'submitted';
    const isPending = !isSubmitted;
    
    if (tab === 'submitted' && !isSubmitted) return false;
    if (tab === 'pending' && !isPending) return false;
    // tab === 'all' shows everything

    if (filterRating !== 'All' && String(r.rating) !== String(filterRating)) return false;
    if (filterTechnician !== 'All' && r.technicianName !== filterTechnician) return false;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!r.customerName?.toLowerCase().includes(q) && !r.orderNumber?.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  return (
    <Layout title="Customer Ratings" pageType="list">
      <div className="flex-1 min-w-0">
        <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0f172a]">Customer Ratings</h1>
            <p className="text-sm text-[#64748b] mt-1">View and analyze feedback from customers.</p>
          </div>
          <div className="rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] px-4 py-3 text-sm text-[#0f172a]">
            {ratings.length} reviews total
          </div>
        </div>

        {/* TAB SELECTOR */}
        <div className="mb-4 flex gap-2 flex-wrap">
          {['all', 'submitted', 'pending'].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                tab === t
                  ? 'bg-[#002395] text-white'
                  : 'bg-white border-2 border-[#e2e8f0] text-[#0f172a] hover:border-[#002395]'
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-[#e2e8f0] p-4 mb-6 break-words">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[#002395] w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input
                type="text"
                placeholder="Search customer or order..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border-2 border-[#e2e8f0] focus:border-[#002395] rounded-2xl text-sm focus:outline-none transition-colors font-medium text-[#0f172a]"
              />
            </div>
            {tab === 'submitted' && (
              <select
                value={filterRating}
                onChange={(e) => setFilterRating(e.target.value)}
                className="border-2 border-[#e2e8f0] focus:border-[#002395] text-[#0f172a] text-sm rounded-2xl block w-full md:w-auto p-3 outline-none transition-colors font-medium"
              >
                <option value="All">All Ratings</option>
                <option value="5">5 Stars</option>
                <option value="4">4 Stars</option>
                <option value="3">3 Stars</option>
                <option value="2">2 Stars</option>
                <option value="1">1 Star</option>
              </select>
            )}
            <select
              value={filterTechnician}
              onChange={(e) => setFilterTechnician(e.target.value)}
              className="border-2 border-[#e2e8f0] focus:border-[#002395] text-[#0f172a] text-sm rounded-2xl block w-full md:w-auto p-3 outline-none transition-colors font-medium"
            >
              <option value="All">All Technicians</option>
              {technicians.map(tech => (
                <option key={tech} value={tech}>{tech}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-[#e2e8f0] overflow-hidden break-words">
          {loading ? (
            <div className="p-8 text-center text-[#64748b] font-medium">Loading ratings...</div>
          ) : filteredRatings.length === 0 ? (
            <div className="p-8 text-center text-[#64748b] font-medium">No ratings found.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredRatings.map(r => (
                <div key={r.id} className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-5 py-4 hover:bg-gray-50 transition-colors break-words">
                  <div className="min-w-0">
                    <p className="font-semibold text-[#0f172a] text-sm truncate">{r.customerName}</p>
                    <a href={`tel:${r.customerPhone}`} className="text-xs text-green-600 font-semibold truncate block">{r.customerPhone}</a>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#0f172a] truncate">{r.brand} {r.model}</p>
                    <Link to={`/service/${r.serviceOrderId}`} className="text-xs text-[#002395] hover:underline font-semibold truncate">{r.orderNumber}</Link>
                  </div>
                  <div className="text-sm text-[#0f172a] font-medium whitespace-nowrap">{r.technicianName || '-'}</div>
                  {tab === 'submitted' && (
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 text-yellow-400 text-sm">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <span key={i}>{i < r.rating ? '★' : '☆'}</span>
                        ))}
                      </div>
                      <p className="text-xs text-[#64748b] mt-1 truncate">{r.comment ? `"${r.comment}"` : '-'}</p>
                    </div>
                  )}
                  <div className="text-xs text-[#64748b] whitespace-nowrap">
                    {tab === 'submitted'
                      ? (r.submittedAt?.toDate ? r.submittedAt.toDate().toLocaleString() : r.submittedAt ? new Date(r.submittedAt).toLocaleString() : '-')
                      : (r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString() : r.createdAt ? new Date(r.createdAt).toLocaleString() : '-')}
                  </div>
                  {userRole === 'admin' && (
                    <button onClick={() => setDeleteTarget(r)} title="Delete" className="text-[#ED2939] hover:bg-red-50 px-3 py-2 rounded-2xl text-xs font-semibold transition-colors">
                      Delete
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <ConfirmDeleteModal
          isOpen={!!deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          deleting={deleting}
          title="Delete Rating"
          message="Are you sure you want to delete this rating? This action cannot be undone."
        />
      </div>
    </Layout>
  );
};

export default RatingsList;
