import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../context/AuthContext';

// ─── Sub-components ────────────────────────────────────────────────────────────

const StatCard = ({ label, value, sub, color = 'var(--accent-cyan)' }) => (
  <div className="card" style={{ padding: '20px 24px' }}>
    <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--font-mono)', color, marginBottom: 4 }}>
      {value}
    </div>
    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{label}</div>
    {sub && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sub}</div>}
  </div>
);

// ─── Overview Tab ───────────────────────────────────────────────────────────────

function OverviewTab({ user, data, loading }) {
  const navigate = useNavigate();
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
    <div style={{ animation: 'fadeIn 0.35s ease' }}>
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
          <button onClick={() => navigate('/exam-center')} className="btn btn-primary" style={{ padding: '12px 28px', fontSize: 15 }}>
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
                          fontSize: 14, fontWeight: 800, fontFamily: 'var(--font-mono)',
                          color: isInProgress ? 'var(--text-muted)' : (isPassed ? 'var(--accent-green)' : 'var(--accent-red)')
                        }}>
                          {isInProgress ? 'IN PROGRESS' : `${exam.score}%`}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Score</div>
                      </div>

                      <div style={{ textAlign: 'center' }}>
                        <div style={{
                          fontSize: 14, fontWeight: 700,
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
                        onClick={() => navigate(`/exam/${exam.$id}`)}
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
              <button onClick={() => navigate('/exam-center')} className="btn btn-primary" style={{ marginTop: 16, fontSize: 13 }}>
                Start Your First Simulation
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Quiz Pad Tab ───────────────────────────────────────────────────────────────

const SAMPLE_TEXT = `---
QUESTION 1 | Difficulty: Hard | Domain: Development with AWS Services | Subdomain: Lambda + SQS Integration

SCENARIO:
A fintech company processes ACH payment transactions using a Lambda function (1024 MB memory, 300-second timeout) triggered by an SQS Standard queue. The queue has a visibility timeout of 90 seconds and a redrive policy configured to send messages to a DLQ after 3 receive attempts. During peak processing windows, the Lambda function occasionally takes 110–140 seconds to complete due to downstream banking API latency. Engineers are observing that certain payment messages are being processed multiple times.

QUESTION:
What is the root cause and the correct remediation?

A. Increase the Lambda reserved concurrency from 50 to 500 to prevent throttling-induced requeuing.
B. The SQS visibility timeout of 90 seconds is shorter than the maximum Lambda execution time. Increase the visibility timeout to at least 1800 seconds (6x the Lambda timeout).
C. The SQS visibility timeout of 90 seconds is shorter than the maximum Lambda execution time of 140 seconds. Increase the queue visibility timeout to at least 310 seconds to exceed the Lambda timeout.
D. Enable SQS FIFO queue with content-based deduplication and set a message deduplication ID on each ACH transaction.

CORRECT ANSWER: C

WHY THIS IS CORRECT:
When Lambda polls SQS via an event source mapping, the visibility timeout of the queue must exceed the Lambda function's maximum execution duration; otherwise SQS will make the message visible again while Lambda is still processing it, causing another Lambda invocation to pick it up—resulting in duplicates even without any Lambda errors.

WHY THE OTHERS ARE WRONG:
A. Reserved concurrency throttling causes Lambda to not process messages at all (they remain in the queue), not to process them twice.
B. While correctly identifying the root cause, 1800 seconds is overly conservative. The minimum required value is 310 seconds given the observed 140-second max.
D. FIFO deduplication prevents the same message from being enqueued twice, not from being re-delivered during an active processing window.

EXAM TRICK:
Most candidates assume duplicate processing means Lambda is erroring and retrying. Duplicates can occur with zero Lambda errors when visibility timeout < actual execution time.

MEMORY HOOK:
"VT > ET or you'll duplicate it" — Visibility Timeout must always be Greater Than Execution Time.`;

// Count how many questions are in the pasted text (client-side preview)
function previewQuestions(text) {
  if (!text.trim()) return [];
  const regex = /QUESTION\s+(\d+)\s*\|([^\n]+)/gi;
  const found = [];
  let m;
  while ((m = regex.exec(text)) !== null) {
    const headerRest = m[2];
    const domainMatch = headerRest.match(/Domain:\s*([^|]+)/i);
    const diffMatch = headerRest.match(/Difficulty:\s*([^|]+)/i);
    found.push({
      num: parseInt(m[1]),
      domain: domainMatch ? domainMatch[1].trim() : 'General',
      difficulty: diffMatch ? diffMatch[1].trim() : 'Medium',
    });
  }
  return found;
}

const DIFFICULTY_COLORS = {
  Easy: 'var(--accent-green)',
  Medium: 'var(--accent-cyan)',
  Hard: 'var(--accent-orange)',
  Expert: 'var(--accent-red)',
};

function QuizPadTab() {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const textareaRef = useRef(null);

  const preview = previewQuestions(text);
  const hasContent = text.trim().length > 0;
  const canImport = hasContent && preview.length > 0;

  const handleImport = async () => {
    if (!canImport) return;
    setImporting(true);
    setImportError('');
    try {
      const res = await api.post('/quiz/exams/import', { text });
      navigate(`/exam/${res.data.examId}`);
    } catch (err) {
      setImportError(err.response?.data?.error || 'Failed to import quiz. Please check the format and try again.');
      setImporting(false);
    }
  };

  const loadSample = () => {
    setText(SAMPLE_TEXT);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const clearAll = () => {
    setText('');
    setImportError('');
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  // Domain distribution for preview
  const domainCounts = preview.reduce((acc, q) => {
    const key = q.domain.split('—')[0].trim();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return (
    <div style={{ animation: 'fadeIn 0.35s ease' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>
            Quiz Pad
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6, maxWidth: 560 }}>
            Paste your custom question text below. Questions must follow the <code style={{ color: 'var(--accent-cyan)', fontSize: 12 }}>QUESTION N | Difficulty: ... | Domain: ...</code> format. The quiz launches instantly with full simulation mode, history tracking, and AI Mentor enabled.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button onClick={loadSample} className="btn btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }}>
            📋 Load Sample
          </button>
          {hasContent && (
            <button onClick={clearAll} className="btn btn-ghost" style={{ fontSize: 12, padding: '7px 14px', color: 'var(--accent-red)', borderColor: 'rgba(255,68,68,0.3)' }}>
              ✕ Clear
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: preview.length > 0 ? '1fr 300px' : '1fr', gap: 20, alignItems: 'start' }}>
        {/* Left: Textarea */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ position: 'relative' }}>
            <textarea
              ref={textareaRef}
              id="quiz-pad-textarea"
              className="input quiz-pad-textarea"
              value={text}
              onChange={e => { setText(e.target.value); setImportError(''); }}
              placeholder={`Paste your question block here...\n\nExpected format:\n\nQUESTION 1 | Difficulty: Hard | Domain: Security | Subdomain: KMS\n\nSCENARIO:\n...\n\nQUESTION:\n...\n\nA. Option A\nB. Option B\nC. Option C\nD. Option D\n\nCORRECT ANSWER: B\n\nWHY THIS IS CORRECT:\n...\n\nWHY THE OTHERS ARE WRONG:\n...`}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
            />
            {hasContent && (
              <div style={{
                position: 'absolute',
                bottom: 12,
                right: 12,
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-muted)',
                background: 'var(--bg-primary)',
                padding: '2px 8px',
                borderRadius: 4,
                border: '1px solid var(--border)',
              }}>
                {text.length.toLocaleString()} chars
              </div>
            )}
          </div>

          {/* Error */}
          {importError && (
            <div style={{
              color: 'var(--accent-red)', fontSize: 13, padding: '10px 14px',
              background: 'rgba(255,68,68,0.08)', borderRadius: 8,
              border: '1px solid rgba(255,68,68,0.25)',
              display: 'flex', alignItems: 'flex-start', gap: 8
            }}>
              <span style={{ flexShrink: 0 }}>⚠️</span>
              <span>{importError}</span>
            </div>
          )}

          {/* Import button */}
          <button
            id="quiz-pad-import-btn"
            onClick={handleImport}
            disabled={!canImport || importing}
            className="btn btn-cyan"
            style={{
              width: '100%', padding: '14px', fontSize: 15,
              justifyContent: 'center',
              opacity: canImport ? 1 : 0.45,
              cursor: canImport ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s',
            }}
          >
            {importing ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
                <span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
                Processing & Creating Simulation...
              </span>
            ) : canImport ? (
              `🚀 Import & Start Quiz (${preview.length} Question${preview.length !== 1 ? 's' : ''})`
            ) : (
              '🚀 Import & Start Quiz'
            )}
          </button>

          {/* Format hint */}
          {!hasContent && (
            <div className="card" style={{ padding: '18px 20px', background: 'rgba(0,212,255,0.03)', border: '1px solid rgba(0,212,255,0.1)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)', marginBottom: 10, letterSpacing: '0.05em' }}>
                REQUIRED FORMAT
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  { tag: 'QUESTION N |', desc: 'Header with difficulty, domain, subdomain' },
                  { tag: 'SCENARIO:', desc: 'Optional context block' },
                  { tag: 'QUESTION:', desc: 'The actual question text' },
                  { tag: 'A. B. C. D.', desc: 'Four answer options' },
                  { tag: 'CORRECT ANSWER:', desc: 'The correct letter (A–D)' },
                  { tag: 'WHY THIS IS CORRECT:', desc: 'Explanation of correct answer' },
                  { tag: 'WHY THE OTHERS ARE WRONG:', desc: 'Per-option wrong answer reasoning' },
                  { tag: 'EXAM TRICK: / MEMORY HOOK:', desc: 'Optional but renders in quiz' },
                ].map(item => (
                  <div key={item.tag} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <code style={{ color: 'var(--accent-orange)', fontSize: 11, fontFamily: 'var(--font-mono)', flexShrink: 0, minWidth: 160 }}>{item.tag}</code>
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{item.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Live Preview Panel */}
        {preview.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 20 }}>
            {/* Summary card */}
            <div className="card" style={{ padding: '18px 20px', background: 'linear-gradient(135deg, rgba(0,212,255,0.06), rgba(139,92,246,0.04))', border: '1px solid rgba(0,212,255,0.15)' }}>
              <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: 10 }}>DETECTED</div>
              <div style={{ fontSize: 36, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--accent-cyan)', lineHeight: 1, marginBottom: 4 }}>
                {preview.length}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Question{preview.length !== 1 ? 's' : ''} ready to simulate
              </div>
            </div>

            {/* Domain breakdown */}
            {Object.keys(domainCounts).length > 0 && (
              <div className="card" style={{ padding: '16px 18px' }}>
                <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: 12 }}>DOMAIN BREAKDOWN</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {Object.entries(domainCounts).map(([domain, count]) => (
                    <div key={domain}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.3, maxWidth: 180 }}>{domain}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)', flexShrink: 0 }}>{count}</span>
                      </div>
                      <div style={{ height: 3, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%',
                          width: `${(count / preview.length) * 100}%`,
                          background: 'linear-gradient(90deg, var(--accent-cyan), var(--accent-purple))',
                          borderRadius: 2,
                          transition: 'width 0.4s ease',
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Question list */}
            <div className="card" style={{ padding: '16px 18px', maxHeight: 340, overflowY: 'auto' }}>
              <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: 12 }}>QUESTIONS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {preview.map((q, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                  }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: 6,
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)',
                      color: 'var(--text-muted)', flexShrink: 0,
                    }}>
                      {q.num}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {q.domain.split('—')[0].trim()}
                      </div>
                    </div>
                    <div style={{
                      fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)',
                      color: DIFFICULTY_COLORS[q.difficulty] || 'var(--text-muted)',
                      flexShrink: 0,
                    }}>
                      {q.difficulty.toUpperCase().slice(0, 4)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* What happens next */}
            <div style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.12)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-green)', fontFamily: 'var(--font-mono)', marginBottom: 8, letterSpacing: '0.05em' }}>WHAT HAPPENS NEXT</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {[
                  '✓ Questions saved to your history',
                  '✓ Full timed simulation mode',
                  '✓ AI Mentor evaluation active',
                  '✓ Appears in Recent Exams',
                  '✓ Full review after completion',
                ].map(item => (
                  <div key={item} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{item}</div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Dashboard ─────────────────────────────────────────────────────────────

const TABS = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'quiz-pad', label: 'Quiz Pad', icon: '📝' },
];

export default function Dashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/quiz/dashboard').then(res => {
      setData(res.data);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ maxWidth: 900, animation: 'fadeIn 0.4s ease' }}>
      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>
          Welcome back, {user?.name?.split(' ')[0]} 👋
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          Your AWS Certified Developer - Associate (DVA-C02) Simulation Dashboard
        </p>
      </div>

      {/* Tab bar */}
      <div className="dash-tabs" role="tablist" aria-label="Dashboard sections">
        {TABS.map(tab => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`dash-tab${activeTab === tab.id ? ' active' : ''}`}
          >
            <span className="dash-tab-icon">{tab.icon}</span>
            {tab.label}
            {tab.id === 'quiz-pad' && (
              <span style={{
                marginLeft: 6, fontSize: 10, fontWeight: 700,
                background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-purple))',
                color: '#080C14',
                padding: '2px 6px', borderRadius: 4,
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.03em',
              }}>NEW</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ paddingTop: 4 }}>
        {activeTab === 'overview' && (
          <OverviewTab user={user} data={data} loading={loading} />
        )}
        {activeTab === 'quiz-pad' && (
          <QuizPadTab />
        )}
      </div>
    </div>
  );
}
