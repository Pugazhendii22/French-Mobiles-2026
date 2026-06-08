import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth, db, secondaryAuth } from '../../firebase/firebase';
import { useAuth } from '../../context/AuthContext';
import { Navigate, useNavigate } from 'react-router-dom';
import Layout from '../../components/common/Layout';
import ConfirmDeleteModal from '../../components/ConfirmDeleteModal';

const StaffManagement = () => {
  const { currentUser, userRole } = useAuth();
  const navigate = useNavigate();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newStaff, setNewStaff] = useState({ name: '', email: '', password: '', role: 'staff' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchStaff = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'users'));
      const staffList = [];
      querySnapshot.forEach((doc) => { staffList.push(doc.data()); });
      setStaff(staffList);
    } catch (err) { console.error("Error fetching staff:", err); } finally { setLoading(false); }
  };

  useEffect(() => { if (userRole === 'admin') fetchStaff(); }, [userRole]);

  if (userRole !== 'admin') return <Navigate to="/dashboard" replace />;

  const handleToggleStatus = async (uid, currentStatus) => {
    if (uid === currentUser.uid) return;
    try { await updateDoc(doc(db, 'users', uid), { isActive: !currentStatus }); fetchStaff(); } catch (err) { console.error(err); }
  };

  const handleAddStaff = async (e) => {
    e.preventDefault();
    setError(''); setSubmitting(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newStaff.email, newStaff.password);
      const user = userCredential.user;
      await signOut(secondaryAuth);
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid, name: newStaff.name, email: newStaff.email, role: newStaff.role, isActive: true, createdAt: new Date().toISOString()
      });
      setShowModal(false);
      setNewStaff({ name: '', email: '', password: '', role: 'staff' });
      fetchStaff();
    } catch (err) { setError(err.message); } finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'users', deleteTarget.uid));
      setStaff(prev => prev.filter(s => s.uid !== deleteTarget.uid));
      setDeleteTarget(null);
    } catch (err) { console.error(err); }
    finally { setDeleting(false); }
  };

  useEffect(() => {
    if (showModal || deleteTarget) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => { document.body.style.overflow = "unset"; };
  }, [showModal, deleteTarget]);

  return (
    <Layout title="Staff Management" pageType="list">
      <div className="flex-1 min-w-0">
        <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0f172a]">Staff Management</h1>
            <p className="text-sm text-[#64748b] mt-1">Maintain staff access and activity at a glance.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setShowModal(true)}
              className="bg-[#002395] hover:bg-[#001a7a] text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 break-words"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
              Add Staff
            </button>
            <button
              onClick={() => navigate('/admin/settings')}
              className="bg-white border border-[#002395] text-[#002395] px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 break-words"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
              Settings
            </button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_auto] items-start mb-6">
          <div className="bg-white rounded-2xl shadow-sm border border-[#e2e8f0] p-5 break-words">
            <p className="text-xs uppercase tracking-[0.18em] text-[#002395] font-bold">Team Overview</p>
            <p className="mt-3 text-3xl font-bold text-[#0f172a]">{staff.length}</p>
            <p className="mt-1 text-sm text-[#64748b]">Active staff members in the system.</p>
          </div>
          <div className="bg-[#f8fafc] rounded-2xl shadow-sm border border-[#e2e8f0] p-5 break-words">
            <p className="text-sm font-semibold text-[#002395]">Quick actions</p>
            <p className="mt-2 text-sm text-[#64748b]">Add new personnel, activate or deactivate accounts, and remove staff safely.</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-[#e2e8f0] overflow-hidden break-words">
          {loading ? (
            <div className="p-8 text-center text-[#64748b] font-medium">Loading staff...</div>
          ) : staff.length === 0 ? (
            <div className="p-8 text-center text-[#64748b] font-medium">No staff members found.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {staff.map((s) => (
                <div key={s.uid} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-5 py-4 hover:bg-gray-50 transition-colors break-words">
                  <div>
                    <p className="text-sm font-semibold text-[#0f172a]">{s.name}</p>
                    <p className="text-xs text-[#64748b]">{s.email}</p>
                    <p className="mt-2 text-[11px] uppercase tracking-[0.18em] font-semibold text-[#002395]">{s.role}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className={`px-3 py-1 rounded-full text-[11px] font-semibold ${s.isActive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                      {s.isActive ? 'Active' : 'Inactive'}
                    </span>
                    {s.uid !== currentUser.uid && (
                      <button
                        onClick={() => handleToggleStatus(s.uid, s.isActive)}
                        className={`text-xs font-semibold ${s.isActive ? 'text-[#ED2939]' : 'text-green-700'} hover:underline`}
                      >
                        {s.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    )}
                    {s.uid !== currentUser.uid && (
                      <button
                        onClick={() => setDeleteTarget(s)}
                        className="text-[#ED2939] hover:bg-red-50 p-2 rounded-xl transition-colors text-xs font-semibold"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {showModal && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-4">
            <div className="bg-white w-full md:max-w-lg rounded-t-3xl md:rounded-2xl overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between px-5 py-4 bg-[#002395] text-white">
                <h2 className="text-lg font-bold">Add Staff Member</h2>
                <button onClick={() => setShowModal(false)} className="p-2 rounded-full hover:bg-white/20 transition">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="p-5 space-y-4">
                {error && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {error}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-semibold text-[#0f172a] mb-1">Name</label>
                  <input
                    type="text"
                    required
                    value={newStaff.name}
                    onChange={e => setNewStaff({ ...newStaff, name: e.target.value })}
                    placeholder="Full name"
                    className="w-full rounded-2xl border border-[#e2e8f0] px-4 py-3 text-sm text-[#0f172a] focus:border-[#002395] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#0f172a] mb-1">Email</label>
                  <input
                    type="email"
                    required
                    value={newStaff.email}
                    onChange={e => setNewStaff({ ...newStaff, email: e.target.value })}
                    placeholder="Email address"
                    className="w-full rounded-2xl border border-[#e2e8f0] px-4 py-3 text-sm text-[#0f172a] focus:border-[#002395] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#0f172a] mb-1">Password</label>
                  <input
                    type="password"
                    required
                    value={newStaff.password}
                    onChange={e => setNewStaff({ ...newStaff, password: e.target.value })}
                    placeholder="Password"
                    className="w-full rounded-2xl border border-[#e2e8f0] px-4 py-3 text-sm text-[#0f172a] focus:border-[#002395] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#0f172a] mb-1">Role</label>
                  <select
                    value={newStaff.role}
                    onChange={e => setNewStaff({ ...newStaff, role: e.target.value })}
                    className="w-full rounded-2xl border border-[#e2e8f0] px-4 py-3 text-sm text-[#0f172a] focus:border-[#002395] focus:outline-none"
                  >
                    <option value="staff">Staff</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 border-t border-[#e2e8f0] bg-[#f8fafc]">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 rounded-2xl border border-[#d1d5db] py-3 text-sm font-semibold text-[#64748b] hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddStaff}
                  disabled={submitting}
                  className="flex-1 rounded-2xl bg-[#002395] py-3 text-sm font-semibold text-white hover:bg-[#001a7a] disabled:opacity-50"
                >
                  {submitting ? 'Adding...' : 'Add Staff'}
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
          title="Delete Staff Member"
          message="Are you sure you want to delete this staff account? This removes them from Firestore. This action cannot be undone."
        />
      </div>
    </Layout>
  );
};

export default StaffManagement;
