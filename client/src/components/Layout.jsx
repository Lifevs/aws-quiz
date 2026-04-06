import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
  { path: '/dashboard', icon: '⬡', label: 'Dashboard' },
  { path: '/services', icon: '◈', label: 'Services' },
  { path: '/leaderboard', icon: '◎', label: 'Leaderboard' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside style={{
        width: 220,
        background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        top: 0,
        left: 0,
        height: '100vh',
        zIndex: 100,
        transform: mobileOpen ? 'translateX(0)' : undefined,
        transition: 'transform 0.3s ease',
      }}>
        {/* Logo */}
        <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: 'linear-gradient(135deg, #FF9900, #FFB443)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, fontWeight: 800, color: '#000', fontFamily: 'var(--font-display)',
            }}>A</div>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, color: 'var(--text-primary)', lineHeight: 1 }}>AWS</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--accent-orange)', letterSpacing: '0.1em' }}>QUIZ MASTER</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {NAV_ITEMS.map(({ path, icon, label }) => (
            <NavLink key={path} to={path} onClick={() => setMobileOpen(false)} style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 12px', borderRadius: 8,
              textDecoration: 'none', fontFamily: 'var(--font-body)',
              fontWeight: 500, fontSize: 14, transition: 'all 0.2s',
              background: isActive ? 'rgba(255,153,0,0.1)' : 'transparent',
              color: isActive ? 'var(--accent-orange)' : 'var(--text-secondary)',
              borderLeft: isActive ? '2px solid var(--accent-orange)' : '2px solid transparent',
            })}>
              <span style={{ fontSize: 16 }}>{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div style={{ padding: '16px 12px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', marginBottom: 8 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-purple))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, color: '#000', fontFamily: 'var(--font-display)',
              flexShrink: 0,
            }}>{user?.name?.[0]?.toUpperCase()}</div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.email}</div>
            </div>
          </div>
          <button onClick={handleLogout} className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', fontSize: 13 }}>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div onClick={() => setMobileOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 99,
        }} />
      )}

      {/* Main content */}
      <main style={{ flex: 1, marginLeft: 220, minHeight: '100vh', padding: '32px' }}>
        {/* Mobile header */}
        <div style={{ display: 'none' }} className="mobile-header">
          <button onClick={() => setMobileOpen(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontSize: 20 }}>☰</button>
        </div>
        <Outlet />
      </main>

      <style>{`
        @media (max-width: 768px) {
          aside { transform: translateX(-100%); }
          main { margin-left: 0 !important; padding: 16px !important; }
          .mobile-header { display: flex !important; align-items: center; margin-bottom: 16px; }
        }
      `}</style>
    </div>
  );
}
