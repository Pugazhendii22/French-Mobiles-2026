import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../../firebase/firebase';
import { useAuth } from '../../context/AuthContext';

/* ─────────────────────────────────────────────
   NAV ITEMS
   Each item can be adminOnly / staffOnly
────────────────────────────────────────────── */
const NAV_ITEMS = [
  {
    label: 'Dashboard', path: '/dashboard',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
  },
  {
    label: 'Customers', path: '/customers',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  },
  {
    label: 'Second-Hand', path: '/inventory/second-hand',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>,
  },
  {
    label: 'Products', path: '/products',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>,
  },
  {
    label: 'Service', path: '/service',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>,
  },
  {
    label: 'Sales', path: '/sales',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  },
  {
    label: 'Due Payments', path: '/due-payments',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  },
  {
    label: 'Enquiries', path: '/enquiries',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>,
  },
  {
    label: 'Scanner', path: '/scanner',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>,
  },
  {
    label: 'Labels', path: '/admin/labels',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>,
  },
  {
    label: 'Settings', path: '/admin/settings', adminOnly: true,
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>,
  },
  {
    label: 'Reports', path: '/reports', adminOnly: true,
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
  },
  {
    label: 'Tasks', path: '/tasks', staffOnly: true,
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>,
  },
  {
    label: 'Task Management', path: '/admin/tasks', adminOnly: true,
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>,
  },
  {
    label: 'Ratings', path: '/admin/ratings', adminOnly: true,
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>,
  },
  {
    label: 'Staff', path: '/admin/staff', adminOnly: true,
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>,
  },
];

/* ─────────────────────────────────────────────
   BOTTOM NAV ITEMS (5 primary tabs for mobile)
────────────────────────────────────────────── */
const BOTTOM_NAV = [
  {
    label: 'Home', path: '/dashboard',
    icon: (active) => (
      <svg className="w-6 h-6" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    label: 'Second-Hand', path: '/inventory/second-hand',
    icon: (active) => (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? '2.5' : '2'} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    label: 'Service', path: '/service',
    icon: (active) => (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? '2.5' : '2'} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? '2.5' : '2'} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    label: 'Sales', path: '/sales',
    icon: (active) => (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? '2.5' : '2'} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    label: 'Scanner', path: '/scanner',
    icon: (active) => (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? '2.5' : '2'} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
      </svg>
    ),
  },
];

/* ─────────────────────────────────────────────
   SIDEBAR CONTENT (desktop + menu drawer)
────────────────────────────────────────────── */
const SidebarContent = ({ navItems, location, userName, currentUser, userRole, initials, onClose, onLogout }) => (
  <div className="flex flex-col h-full bg-slate-900 text-white">
    {/* Logo */}
    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 shrink-0">
      <div>
        <h1 className="text-lg font-bold text-white">French Mobiles</h1>
        <p className="text-xs text-slate-400">Management System</p>
      </div>
      {onClose && (
        <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded transition-colors break-words">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>

    {/* User info */}
    <div className="px-5 py-4 border-b border-slate-700 shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-[#002395] flex items-center justify-center text-sm font-bold shrink-0 break-words">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{userName || currentUser?.email}</p>
          <p className="text-xs text-slate-400 capitalize">{userRole}</p>
        </div>
      </div>
    </div>

    {/* Nav links */}
    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
      {navItems.map(item => {
        const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
        return (
          <Link
            key={item.path}
            to={item.path}
            onClick={onClose}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? 'bg-[#002395] text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </nav>

    {/* Logout */}
    <div className="px-3 py-4 border-t border-slate-700 shrink-0">
      <button
        onClick={onLogout}
        className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-red-900/50 hover:text-red-300 transition-colors break-words"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
        Logout
      </button>
    </div>
  </div>
);

/* ─────────────────────────────────────────────
   MAIN LAYOUT COMPONENT
   pageType: "dashboard" | "list" | "form" | "detail"
   backTo: path string or -1 for back
   fab: React node (floating action button, list pages)
   stickyAction: React node (sticky bottom bar for form/detail on mobile)
────────────────────────────────────────────── */
const Layout = ({
  children,
  title,
  pageType = 'list',
  backTo = null,
  fab = null,
  stickyAction = null,
}) => {
  const { currentUser, userName, userRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuDrawerOpen, setMenuDrawerOpen] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchActive = useRef(false);

  const handleTouchStart = (e) => {
    if (e.touches.length !== 1 || menuDrawerOpen) return;
    const { clientX, clientY } = e.touches[0];
    if (clientX <= 24) {
      touchStartX.current = clientX;
      touchStartY.current = clientY;
      touchActive.current = true;
    }
  };

  const handleTouchMove = (e) => {
    if (!touchActive.current || !e.touches.length) return;
    const { clientX, clientY } = e.touches[0];
    const deltaX = clientX - touchStartX.current;
    const deltaY = clientY - touchStartY.current;
    if (deltaX > 60 && Math.abs(deltaY) < 40) {
      setMenuDrawerOpen(true);
      touchActive.current = false;
    }
  };

  const handleTouchEnd = () => {
    touchActive.current = false;
  };

  // Close drawer on route change
  useEffect(() => {
    setMenuDrawerOpen(false);
  }, [location.pathname]);

  // Prevent body scroll when drawer open
  useEffect(() => {
    if (menuDrawerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [menuDrawerOpen]);

  const handleLogout = useCallback(async () => {
    try {
      await signOut(auth);
      sessionStorage.clear();
      localStorage.clear();
      navigate('/login', { replace: true });
    } catch (err) {
      console.error(err);
    }
  }, [navigate]);

  const handleBack = useCallback(() => {
    if (backTo) {
      navigate(backTo);
    } else {
      navigate(-1);
    }
  }, [navigate, backTo]);

  const initials = (userName || currentUser?.email || 'U')[0].toUpperCase();

  const navItems = NAV_ITEMS.filter(item => {
    if (userRole === 'admin') return !item.staffOnly;
    return !item.adminOnly;
  });

  const showBackButton = pageType === 'form' || pageType === 'detail';
  const hasStickyAction = !!stickyAction;

  // Mobile bottom padding: nav (64px=pb-16) + optional sticky action bar (56px extra)
  const mobilePb = hasStickyAction ? 'pb-32 md:pb-0' : 'pb-16 md:pb-0';

  return (
    <div className="min-h-screen bg-gray-100 flex">

      {/* ── DESKTOP SIDEBAR ── */}
      <aside className="hidden md:flex md:flex-col md:w-64 flex-shrink-0 md:fixed md:inset-y-0 z-30 shadow-lg break-words">
        <SidebarContent
          navItems={navItems}
          location={location}
          userName={userName}
          currentUser={currentUser}
          userRole={userRole}
          initials={initials}
          onClose={null}
          onLogout={handleLogout}
        />
      </aside>

      {/* ── MOBILE MENU DRAWER (slide from left) ── */}
      {menuDrawerOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60"
            onClick={() => setMenuDrawerOpen(false)}
          />
          {/* Panel */}
          <aside className="relative w-72 max-w-[85vw] flex flex-col z-50 shadow-2xl animate-slide-in-left break-words">
            <SidebarContent
              navItems={navItems}
              location={location}
              userName={userName}
              currentUser={currentUser}
              userRole={userRole}
              initials={initials}
              onClose={() => setMenuDrawerOpen(false)}
              onLogout={handleLogout}
            />
          </aside>
        </div>
      )}

      {/* ── MAIN CONTENT AREA ── */}
      <div
        className="flex-1 flex flex-col min-w-0 overflow-y-auto md:ml-64"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >

        {/* ── TOPBAR ── */}
        <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-20 print:hidden break-words">
          <div className="flex items-center h-14 px-4 gap-3">

                <button
              onClick={() => setMenuDrawerOpen(prev => !prev)}
              className="flex items-center justify-center text-gray-500 hover:text-[#002395] transition-colors font-medium shrink-0 px-2 py-1.5 rounded-lg hover:bg-blue-50 md:hidden"
              aria-label="Open menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            {showBackButton && (
              <button
                onClick={handleBack}
                id="layout-back-btn"
                className="flex items-center gap-1.5 text-gray-500 hover:text-[#002395] transition-colors font-medium shrink-0 px-2 py-1.5 rounded-lg hover:bg-blue-50 break-words"
                aria-label="Go back"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                <span className="text-sm hidden sm:inline">Back</span>
              </button>
            )}

            {/* Title — centered on mobile, left on desktop */}
            <h2 className="flex-1 text-base font-semibold text-gray-800 md:text-lg truncate text-center md:text-left">
              {title || 'French Mobiles'}
            </h2>

            {/* Right: avatar */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="hidden md:block text-sm text-gray-600 font-medium truncate max-w-[150px]">
                {userName || currentUser?.email}
              </span>
              <div className="w-8 h-8 rounded-full bg-[#002395] flex items-center justify-center text-white text-sm font-bold break-words">
                {initials}
              </div>
            </div>
          </div>
        </header>

        {/* ── PAGE CONTENT ── */}
        <main className={`flex-1 ${mobilePb}`}>
          <div className={`
            h-full
            ${pageType === 'form' ? 'max-w-2xl mx-auto px-4 py-6' : 'p-4 sm:p-4 md:p-6'}
          `}>
            {children}
          </div>
        </main>

        {/* ── STICKY MOBILE ACTION BAR (form/detail) ── */}
        {hasStickyAction && (
          <div className="md:hidden fixed bottom-16 left-0 right-0 z-30 bg-white border-t border-gray-200 px-4 py-3 shadow-lg print:hidden break-words">
            {stickyAction}
          </div>
        )}

        {/* ── MOBILE BOTTOM NAVIGATION ── */}
        <nav
          id="mobile-bottom-nav"
          className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-lg print:hidden break-words"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="flex items-stretch h-16">
            {BOTTOM_NAV.map((item) => {
              const isMenu = item.path === null;
              const isActive = isMenu
                ? menuDrawerOpen
                : (location.pathname === item.path || location.pathname.startsWith(item.path + '/'));

              return (
                <button
                  key={item.label}
                  id={`bottom-nav-${item.label.toLowerCase()}`}
                  onClick={() => {
                    if (isMenu) {
                      setMenuDrawerOpen(prev => !prev);
                    } else {
                      navigate(item.path);
                    }
                  }}
                  className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
                    isActive
                      ? 'text-[#002395]'
                      : 'text-gray-400 hover:text-gray-600'
                  }`}
                  aria-label={item.label}
                >
                  {item.icon(isActive)}
                  <span className={`text-[10px] font-semibold tracking-wide ${isActive ? 'text-[#002395]' : 'text-gray-400'}`}>
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      {/* ── FAB (Floating Action Button, list pages, mobile) ── */}
      {fab && (
        <div className="md:hidden fixed bottom-20 right-4 z-40 print:hidden">
          {fab}
        </div>
      )}
    </div>
  );
};

export default Layout;
