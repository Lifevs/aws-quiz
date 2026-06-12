import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../context/AuthContext';

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
  const recentExams = data?.recentExams || [];

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s}s`;
  };

  const formatDate = (isoString) => {
    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

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
          Your AWS Certified Developer - Associate (DVA-C02) Simulation Dashboard
        </p>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 16, marginBottom: 32 }}>
        <StatCard label="Total Exams" value={stats.total_completed || 0} sub="Completed runs" color="var(--accent-cyan)" />
        <StatCard label="Average Score" value={`${stats.avg_score || 0}%`} sub="Across completed runs" color="var(--accent-orange)" />
        <StatCard label="Passing Rate" value={`${stats.pass_rate || 0}%`} sub="Passing score is 72%" color="var(--accent-green)" />
        <StatCard label="Best Score" value={`${stats.best_score || 0}%`} sub="Your record high" color="var(--accent-purple)" />
      </div>

      {/* Accuracy bar */}
      {stats.total_completed > 0 && (
        <div className="card" style={{ padding: '20px 24px', marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>AVERAGE SCORE PROGRESS</span>
            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', color: stats.avg_score >= 72 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
              {stats.avg_score}%
            </span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{
              width: `${stats.avg_score}%`,
              background: stats.avg_score >= 72 ? 'var(--accent-green)' : 'var(--accent-red)',
            }} />
          </div>
        </div>
      )}

      {/* Main layout grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 24 }}>
        
        {/* Launch Exam CTA */}
        <div className="card" style={{
          padding: '28px 32px', textAlign: 'center',
          background: 'linear-gradient(135deg, rgba(255,153,0,0.08), rgba(0,212,255,0.06))',
          border: '1px solid rgba(255,153,0,0.2)',
        }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, marginBottom: 8 }}>
            Ready to test your AWS Certified Developer skills?
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>
            Generate random domain-weighted questions in real exam scenarios. Choose between Quick Quizzes or Full 65-question simulators.
          </p>
          <button onClick={() => navigate('/services')} className="btn btn-primary" style={{ padding: '12px 28px', fontSize: 15 }}>
            Go to Exam Center →
          </button>
        </div>

        {/* Recent simulation exams */}
        <div className="card" style={{ padding: '24px' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 18 }}>
            Recent Simulation Exams
          </h3>
          {recentExams.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {recentExams.map(exam => {
                const isPassed = exam.status === 'pass';
                const isInProgress = exam.status === 'in_progress';
                return (
                  <div key={exam.$id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 16px',
                      borderRadius: 10,
                      background: 'var(--bg-secondary)',
                      border: `1px solid var(--border)`,
                      gap: 16,
                      flexWrap: 'wrap'
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 150 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                        {exam.total_questions} Questions Exam
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        Started on {formatDate(exam.created_at)}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{
                          fontSize: 14,
                          fontWeight: 800,
                          fontFamily: 'var(--font-mono)',
                          color: isInProgress ? 'var(--text-muted)' : (isPassed ? 'var(--accent-green)' : 'var(--accent-red)')
                        }}>
                          {isInProgress ? 'IN PROGRESS' : `${exam.score}%`}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Score</div>
                      </div>

                      <div style={{ textAlign: 'center' }}>
                        <div style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: isInProgress ? 'var(--text-muted)' : (isPassed ? 'var(--accent-green)' : 'var(--accent-red)')
                        }}>
                          {isInProgress ? '–' : (isPassed ? 'PASS' : 'FAIL')}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Status</div>
                      </div>

                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                          {isInProgress ? '–' : `${exam.correct_answers}/${exam.total_questions}`}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Correct</div>
                      </div>

                      <div style={{ textAlign: 'center', marginRight: 8 }}>
                        <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                          {isInProgress ? '–' : formatTime(exam.time_taken)}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Time</div>
                      </div>

                      <button
                        onClick={() => navigate(`/quiz/${exam.$id}`)}
                        className={`btn ${isInProgress ? 'btn-primary' : 'btn-ghost'}`}
                        style={{ fontSize: 13, padding: '8px 16px' }}
                      >
                        {isInProgress ? 'Resume' : 'Review'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '30px 0' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
              <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No exams recorded yet.</p>
              <button onClick={() => navigate('/services')} className="btn btn-primary" style={{ marginTop: 16, fontSize: 13 }}>
                Start Your First Simulation
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
