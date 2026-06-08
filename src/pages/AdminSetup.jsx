import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, setDoc, doc, limit } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../firebase/firebase';
import { useNavigate } from 'react-router-dom';

const AdminSetup = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const checkAdminExists = async () => {
      try {
        const q = query(collection(db, 'users'), where('role', '==', 'admin'), limit(1));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          // Admin already exists
          navigate('/login', { replace: true });
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.error("Error checking for admin:", err);
        setError("Failed to verify system status. Please try again later.");
        setLoading(false);
      }
    };

    checkAdminExists();
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      // Create user in Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Create user document in Firestore
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: user.email,
        name: name,
        role: 'admin',
        createdAt: new Date().toISOString(),
        isActive: true
      });

      // Redirect to login after successful creation
      navigate('/login', { replace: true });
    } catch (err) {
      console.error(err);
      setError('Failed to create admin account: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#f8fafc]">
        <div className="w-12 h-12 border-4 border-[#002395] rounded-full border-t-transparent animate-spin break-words"></div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#f8fafc]">
      <div className="w-full max-w-md p-6 md:p-10 space-y-8 bg-white rounded-2xl shadow-xl border border-[#e2e8f0] break-words">
        <div className="text-center">
          <h2 className="text-4xl font-extrabold text-[#002395] tracking-tight">System Setup</h2>
          <p className="mt-2 text-sm text-[#64748b] font-medium">Create the initial Admin account</p>
        </div>

        {error && (
          <div className="p-4 text-sm font-bold text-[#ED2939] bg-red-50 border border-red-200 rounded-xl break-words" role="alert">
            {error}
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Full Name</label>
              <div className="mt-1">
                <input
                  type="text"
                  required
                  className="w-full px-4 py-3 border-2 border-[#e2e8f0] rounded-xl focus:border-[#002395] transition-colors bg-white focus:outline-none font-medium text-[#0f172a] break-words"
                  placeholder="Admin Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Email address</label>
              <div className="mt-1">
                <input
                  type="email"
                  required
                  className="w-full px-4 py-3 border-2 border-[#e2e8f0] rounded-xl focus:border-[#002395] transition-colors bg-white focus:outline-none font-medium text-[#0f172a] break-words"
                  placeholder="admin@frenchmobiles.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <div className="mt-1">
                <input
                  type="password"
                  required
                  minLength={6}
                  className="w-full px-4 py-3 border-2 border-[#e2e8f0] rounded-xl focus:border-[#002395] transition-colors bg-white focus:outline-none font-medium text-[#0f172a] break-words"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full flex justify-center py-3.5 px-4 rounded-xl shadow-sm text-sm font-bold text-white bg-[#002395] hover:bg-[#001a7a] focus:outline-none disabled:opacity-70 disabled:cursor-not-allowed transition-colors break-words"
            >
              {submitting ? 'Creating...' : 'Create Admin Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AdminSetup;
