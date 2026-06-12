import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../context/AuthContext';

const DOMAIN_DETAILS = [
  { name: 'Domain 1: Development with AWS Services', weight: '32%', color: 'var(--accent-cyan)', focus: 'Lambda, API Gateway, DynamoDB, SNS/SQS, Kinesis, Step Functions, caching, idempotency, event-driven integrations' },
  { name: 'Domain 2: Security', weight: '26%', color: 'var(--accent-orange)', focus: 'IAM Policies, Cognito User/Identity Pools, KMS Key management, Secrets Manager, STS AssumeRole, ACM certificate management' },
  { name: 'Domain 3: Deployment', weight: '24%', color: 'var(--accent-green)', focus: 'SAM Templates, CDK basics, CI/CD pipelines (CodeSuite), traffic shifting, Elastic Beanstalk, ECS Fargate, CloudFormation' },
  { name: 'Domain 4: Troubleshooting and Optimization', weight: '18%', color: 'var(--accent-purple)', focus: 'X-Ray Tracing, CloudWatch Logs/Metrics/Alarms, CloudTrail audits, API Gateway errors, CLI credential debugging' }
];

export default function Services() {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedQuestions, setSelectedQuestions] = useState(65);
  const [starting, setStarting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/quiz/exams')
      .then(res => {
        setExams(res.data.exams || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleStartExam = async () => {
    setStarting(true);
    try {
      const res = await api.post('/quiz/exams/start', { totalQuestions: selectedQuestions });
      const examId = res.data.exam.$id;
      navigate(`/quiz/${examId}`);
    } catch (err) {
      alert('Failed to start exam simulation. Please try again.');
      console.error(err);
    } finally {
      setStarting(false);
    }
  };

  const getAccuracy = (exam) => {
    if (!exam || exam.total_questions === 0) return 0;
    return exam.score;
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s}s`;
  };

  const formatDate = (isoString) => {
    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {[...Array(6)].map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 100, borderRadius: 12 }} />
      ))}
    </div>
  );

  return (
    <div style={{ maxWidth: 1000, animation: 'fadeIn 0.4s ease' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, marginBottom: 6 }}>
          AWS DVA-C02 Exam Center
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          Prepare for the AWS Certified Developer - Associate exam using a timed simulation matching the official blueprint.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }}>
        
        {/* Left: Setup Card */}
        <div className="card" style={{ padding: '24px' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, marginBottom: 16, color: 'var(--text-primary)' }}>
            Configure New Exam Simulation
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 20, lineHeight: 1.5 }}>
            Select your preferred simulation size. All questions are dynamically selected from domains based on authentic DVA-C02 weights.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
            {[
              { count: 10, label: 'Quick Quiz', time: '20 minutes', desc: 'Ideal for a fast checkpoint' },
              { count: 20, label: 'Practice Test', time: '40 minutes', desc: 'Good mid-length review' },
              { count: 65, label: 'Full Simulator', time: '130 minutes', desc: 'Authentic DVA-C02 simulation' }
            ].map(opt => (
              <div
                key={opt.count}
                onClick={() => setSelectedQuestions(opt.count)}
                style={{
                  padding: '14px 16px',
                  borderRadius: 10,
                  border: `2px solid ${selectedQuestions === opt.count ? 'var(--accent-orange)' : 'var(--border)'}`,
                  background: selectedQuestions === opt.count ? 'rgba(255,153,0,0.05)' : 'var(--bg-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {opt.label} ({opt.count} Questions)
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{opt.desc}</div>
                </div>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  fontWeight: 700,
                  color: selectedQuestions === opt.count ? 'var(--accent-orange)' : 'var(--text-secondary)',
                  background: 'var(--bg-primary)',
                  padding: '4px 10px',
                  borderRadius: 6
                }}>
                  {opt.time}
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={handleStartExam}
            disabled={starting}
            className="btn btn-primary"
            style={{ width: '100%', padding: '14px', fontSize: 15, justifyContent: 'center' }}
          >
            {starting ? 'Launching...' : 'Start Timed Exam Simulation 🚀'}
          </button>
        </div>

        {/* Right: Domain Info Card */}
        <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
            DVA-C02 Exam Blueprint
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {DOMAIN_DETAILS.map(dom => (
              <div key={dom.name} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {dom.name}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 800, color: dom.color }}>
                    {dom.weight}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  {dom.focus}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Past attempts list */}
      <div className="card" style={{ padding: '24px' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 18 }}>
          Simulation Exam History
        </h3>
        {exams.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 600 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                  {['Date', 'Questions', 'Status', 'Score', 'Time Taken', 'Action'].map(h => (
                    <th key={h} style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontWeight: 700, paddingBottom: 12 }}>
                      {h.toUpperCase()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {exams.map(ex => {
                  const isPassed = ex.status === 'pass';
                  const isInProgress = ex.status === 'in_progress';
                  return (
                    <tr key={ex.$id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }}>
                      <td style={{ fontSize: 13, padding: '14px 0', color: 'var(--text-primary)' }}>
                        {formatDate(ex.created_at)}
                      </td>
                      <td style={{ fontSize: 13, padding: '14px 0', color: 'var(--text-primary)' }}>
                        {ex.total_questions} Questions
                      </td>
                      <td style={{ fontSize: 13, padding: '14px 0' }}>
                        {isInProgress ? (
                          <span className="tag tag-foundation" style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>IN PROGRESS</span>
                        ) : isPassed ? (
                          <span className="tag tag-foundation" style={{ background: 'rgba(0,255,136,0.1)', color: 'var(--accent-green)', border: '1px solid rgba(0,255,136,0.2)' }}>PASS</span>
                        ) : (
                          <span className="tag tag-expert" style={{ background: 'rgba(255,68,68,0.1)', color: 'var(--accent-red)', border: '1px solid rgba(255,68,68,0.2)' }}>FAIL</span>
                        )}
                      </td>
                      <td style={{ fontSize: 14, padding: '14px 0', fontFamily: 'var(--font-mono)', fontWeight: 700, color: isInProgress ? 'var(--text-muted)' : (isPassed ? 'var(--accent-green)' : 'var(--accent-red)') }}>
                        {isInProgress ? '–' : `${ex.score}%`}
                      </td>
                      <td style={{ fontSize: 13, padding: '14px 0', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                        {isInProgress ? '–' : formatTime(ex.time_taken)}
                      </td>
                      <td style={{ padding: '14px 0' }}>
                        <button
                          onClick={() => navigate(`/quiz/${ex.$id}`)}
                          className={`btn ${isInProgress ? 'btn-primary' : 'btn-ghost'}`}
                          style={{ fontSize: 12, padding: '6px 12px' }}
                        >
                          {isInProgress ? 'Resume' : 'Review'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
            📋 No previous exam simulations found. Let's start one above!
          </div>
        )}
      </div>
    </div>
  );
}
