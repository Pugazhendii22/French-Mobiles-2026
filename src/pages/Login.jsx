import React, { useState } from 'react';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/firebase';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { currentUser, authError } = useAuth();

  // If already logged in, redirect to dashboard
  if (currentUser) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const userCred = await signInWithEmailAndPassword(auth, email, password);

      // Check isActive status manually to prevent dashboard flash
      const userDocRef = doc(db, 'users', userCred.user.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists() && userDocSnap.data().isActive === false) {
        await signOut(auth);
        setError('Account disabled');
        setLoading(false);
        return;
      }

      navigate('/dashboard', { replace: true });
    } catch (err) {
      console.error(err);
      setError('Failed to sign in. Please check your email and password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#f8fafc]">
      <div className="w-full max-w-md p-6 md:p-10 space-y-8 bg-white rounded-2xl shadow-xl border border-[#e2e8f0] break-words">
        <div className="text-center">
          <h2 className="text-4xl font-extrabold text-[#002395] tracking-tight">French Mobiles</h2>
          <p className="mt-2 text-sm text-[#64748b] font-medium">Admin Portal Login</p>
        </div>

        {error && (
          <div className="p-4 text-sm font-bold text-[#ED2939] bg-red-50 border border-red-200 rounded-xl break-words" role="alert">
            {error}
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
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
              <div className="relative mt-1">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  className="w-full pr-24 pl-4 py-3 border-2 border-[#e2e8f0] rounded-xl focus:border-[#002395] transition-colors bg-white focus:outline-none font-medium text-[#0f172a] break-words"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(prev => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#002395] hover:text-[#001a7a] focus:outline-none"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-3.5 px-4 rounded-xl shadow-sm text-sm font-bold text-white bg-[#002395] hover:bg-[#001a7a] focus:outline-none disabled:opacity-70 disabled:cursor-not-allowed transition-colors break-words"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
