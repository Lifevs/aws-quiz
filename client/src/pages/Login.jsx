import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(form.email, form.password);
      } else {
        if (!form.name.trim()) { setError('Name is required'); setLoading(false); return; }
        await register(form.name, form.email, form.password);
      }
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-primary)', padding: 20, position: 'relative', overflow: 'hidden',
    }}>
      {/* Background decorations */}
      <div style={{
        position: 'absolute', top: '10%', left: '5%', width: 400, height: 400,
        borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,153,0,0.06) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: '10%', right: '5%', width: 300, height: 300,
        borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,212,255,0.06) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ width: '100%', maxWidth: 420, animation: 'fadeIn 0.5s ease' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: 'linear-gradient(135deg, #FF9900, #FFB443)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, fontWeight: 800, color: '#000', fontFamily: 'var(--font-display)',
            margin: '0 auto 16px', boxShadow: '0 8px 32px rgba(255,153,0,0.3)',
          }}>A</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>
            AWS Quiz Master
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            Adaptive learning for AWS Developer Associate
          </p>
        </div>

        {/* Toggle */}
        <div style={{
          display: 'flex', background: 'var(--bg-secondary)',
          borderRadius: 10, padding: 4, marginBottom: 28,
          border: '1px solid var(--border)',
        }}>
          {['login', 'register'].map(m => (
            <button key={m} onClick={() => { setMode(m); setError(''); }}
              style={{
                flex: 1, padding: '8px', border: 'none', cursor: 'pointer',
                borderRadius: 7, fontFamily: 'var(--font-body)', fontWeight: 600,
                fontSize: 14, transition: 'all 0.2s',
                background: mode === m ? 'var(--bg-card)' : 'transparent',
                color: mode === m ? 'var(--accent-orange)' : 'var(--text-muted)',
                boxShadow: mode === m ? '0 1px 4px rgba(0,0,0,0.3)' : 'none',
              }}>
              {m === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {mode === 'register' && (
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>
                FULL NAME
              </label>
              <input className="input" type="text" placeholder="Your name"
                value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                autoComplete="name" />
            </div>
          )}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>
              EMAIL
            </label>
            <input className="input" type="email" placeholder="you@example.com"
              value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              autoComplete="email" required />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>
              PASSWORD
            </label>
            <input className="input" type="password" placeholder="••••••••"
              value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required />
          </div>

          {error && (
            <div style={{
              padding: '10px 14px', borderRadius: 8,
              background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.3)',
              color: 'var(--accent-red)', fontSize: 13, fontFamily: 'var(--font-mono)',
            }}>{error}</div>
          )}

          <button type="submit" disabled={loading} className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '13px', fontSize: 15, marginTop: 4 }}>
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 16, height: 16, border: '2px solid rgba(0,0,0,0.3)', borderTopColor: '#000', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
                {mode === 'login' ? 'Signing in...' : 'Creating account...'}
              </span>
            ) : (mode === 'login' ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 24, color: 'var(--text-muted)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
          Your progress is saved per account
        </p>
      </div>
    </div>
  );
}
