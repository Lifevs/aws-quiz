import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../context/AuthContext';

const DIFF_COLORS = { foundation: '#00FF88', associate: '#00D4FF', advanced: '#FF9900', expert: '#FF4444' };

const StatCard = ({ label, value, sub, color = 'var(--accent-cyan)' }) => (
  <div className="card" style={{ padding: '20px 24px' }}>
    <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--font-mono)', color, marginBottom: 4 }}>
      {value}
    </div>
    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{label}</div>
    {sub && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sub}</div>}
  </div>
);

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/quiz/dashboard').then(res => {
      setData(res.data);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const stats = data?.stats || {};
  const accuracy = stats.total_attempted > 0
    ? Math.round((stats.total_correct / stats.total_attempted) * 100)
    : 0;

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {[...Array(3)].map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 80, borderRadius: 12 }} />
      ))}
    </div>
  );

  return (
    <div style={{ maxWidth: 900, animation: 'fadeIn 0.4s ease' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>
          Welcome back, {user?.name?.split(' ')[0]} 👋
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          Your AWS Developer Associate preparation dashboard
        </p>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 16, marginBottom: 32 }}>
        <StatCard label="Total Score" value={stats.total_score?.toLocaleString() || 0} sub="Points earned" color="var(--accent-orange)" />
        <StatCard label="Accuracy" value={`${accuracy}%`} sub={`${stats.total_correct}/${stats.total_attempted} correct`} color="var(--accent-green)" />
        <StatCard label="Best Streak" value={stats.best_streak || 0} sub="Consecutive correct" color="var(--accent-cyan)" />
        <StatCard label="Services" value={`${stats.services_started || 0}/32`} sub={`${stats.services_completed || 0} completed`} color="var(--accent-purple)" />
      </div>

      {/* Accuracy bar */}
      {stats.total_attempted > 0 && (
        <div className="card" style={{ padding: '20px 24px', marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>OVERALL ACCURACY</span>
            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', color: accuracy >= 70 ? 'var(--accent-green)' : accuracy >= 50 ? 'var(--accent-orange)' : 'var(--accent-red)' }}>
              {accuracy}%
            </span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{
              width: `${accuracy}%`,
              background: accuracy >= 70 ? 'var(--accent-green)' : accuracy >= 50 ? 'var(--accent-orange)' : 'var(--accent-red)',
            }} />
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Recent services */}
        <div className="card" style={{ padding: '20px 24px' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>
            Recent Services
          </h3>
          {data?.recentServices?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {data.recentServices.map(svc => {
                const acc = svc.questions_attempted > 0 ? Math.round((svc.questions_correct / svc.questions_attempted) * 100) : 0;
                return (
                  <div key={svc.service_id} onClick={() => navigate(`/quiz/${svc.service_id}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', padding: '8px', borderRadius: 8, transition: 'background 0.2s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>
                        {svc.service_name}
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span className={`tag tag-${svc.current_difficulty}`}>{svc.current_difficulty}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{acc}% acc</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--accent-orange)', fontWeight: 700 }}>
                      {svc.total_score}pts
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🚀</div>
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No services started yet</p>
              <button onClick={() => navigate('/services')} className="btn btn-primary" style={{ marginTop: 12, fontSize: 13 }}>
                Start Learning
              </button>
            </div>
          )}
        </div>

        {/* Recent activity */}
        <div className="card" style={{ padding: '20px 24px' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>
            Recent Activity
          </h3>
          {data?.recentActivity?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.recentActivity.map((act, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: act.was_correct ? 'var(--accent-green)' : 'var(--accent-red)',
                  }} />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{act.service_name}</span>
                  </div>
                  <span className={`tag tag-${act.difficulty}`} style={{ fontSize: 10 }}>{act.difficulty}</span>
                  <span style={{ fontSize: 11, color: act.was_correct ? 'var(--accent-green)' : 'var(--accent-red)', fontFamily: 'var(--font-mono)' }}>
                    {act.was_correct ? '✓' : '✗'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No activity yet</p>
            </div>
          )}
        </div>
      </div>

      {/* CTA */}
      {!data?.recentServices?.length && (
        <div className="card" style={{
          marginTop: 24, padding: '28px 32px', textAlign: 'center',
          background: 'linear-gradient(135deg, rgba(255,153,0,0.08), rgba(0,212,255,0.06))',
          border: '1px solid rgba(255,153,0,0.2)',
        }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, marginBottom: 8 }}>
            Ready to ace the AWS exam?
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>
            32 AWS services · Adaptive difficulty · 10 questions per session
          </p>
          <button onClick={() => navigate('/services')} className="btn btn-primary" style={{ padding: '12px 28px', fontSize: 15 }}>
            Browse All Services →
          </button>
        </div>
      )}
    </div>
  );
}
