import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../context/AuthContext';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function Leaderboard() {
  const { user } = useAuth();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/quiz/leaderboard').then(res => {
      setData(res.data.leaderboard);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const userRank = data.findIndex(row => row.name === user?.name) + 1;

  if (loading) return (
    <div style={{ maxWidth: 700 }}>
      {[...Array(8)].map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 60, borderRadius: 10, marginBottom: 8 }} />
      ))}
    </div>
  );

  return (
    <div style={{ maxWidth: 700, animation: 'fadeIn 0.4s ease' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, marginBottom: 6 }}>
          Leaderboard
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          Top learners ranked by total score
        </p>
      </div>

      {/* Your rank badge */}
      {userRank > 0 && (
        <div style={{
          padding: '14px 20px', borderRadius: 10, marginBottom: 20,
          background: 'rgba(255,153,0,0.08)', border: '1px solid rgba(255,153,0,0.25)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 20 }}>🏆</span>
          <div>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14 }}>Your Rank: </span>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-orange)', fontWeight: 800, fontSize: 16 }}>
              #{userRank}
            </span>
          </div>
        </div>
      )}

      {/* Leaderboard table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '50px 1fr 100px 80px 80px',
          padding: '12px 20px', borderBottom: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
        }}>
          {['#', 'Player', 'Score', 'Correct', 'Services'].map(h => (
            <div key={h} style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.05em' }}>
              {h.toUpperCase()}
            </div>
          ))}
        </div>

        {data.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🌟</div>
            <p>Be the first to get on the leaderboard!</p>
          </div>
        ) : (
          data.map((row, i) => {
            const isMe = row.name === user?.name;
            const acc = row.total_attempted > 0 ? Math.round((row.total_correct / row.total_attempted) * 100) : 0;

            return (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '50px 1fr 100px 80px 80px',
                padding: '14px 20px',
                borderBottom: i < data.length - 1 ? '1px solid var(--border)' : 'none',
                background: isMe ? 'rgba(255,153,0,0.06)' : 'transparent',
                transition: 'background 0.2s',
              }}
                onMouseEnter={e => { if (!isMe) e.currentTarget.style.background = 'var(--bg-card-hover)'; }}
                onMouseLeave={e => { if (!isMe) e.currentTarget.style.background = 'transparent'; }}
              >
                {/* Rank */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  {i < 3 ? (
                    <span style={{ fontSize: 18 }}>{MEDALS[i]}</span>
                  ) : (
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: 13, fontWeight: 700 }}>
                      #{i + 1}
                    </span>
                  )}
                </div>

                {/* Name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                    background: `linear-gradient(135deg, hsl(${(i * 47 + 180) % 360}, 70%, 50%), hsl(${(i * 47 + 220) % 360}, 80%, 40%))`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, color: '#fff', fontFamily: 'var(--font-display)',
                  }}>
                    {row.name?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: isMe ? 'var(--accent-orange)' : 'var(--text-primary)' }}>
                      {row.name} {isMe && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(you)</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {acc}% accuracy
                    </div>
                  </div>
                </div>

                {/* Score */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 15, color: i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : 'var(--accent-orange)' }}>
                    {parseInt(row.total_score).toLocaleString()}
                  </span>
                </div>

                {/* Correct */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--accent-green)' }}>
                    {row.total_correct}
                  </span>
                </div>

                {/* Services */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--accent-cyan)' }}>
                    {row.services_completed}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      <p style={{ textAlign: 'center', marginTop: 16, color: 'var(--text-muted)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
        Scores update in real-time after each session
      </p>
    </div>
  );
}
