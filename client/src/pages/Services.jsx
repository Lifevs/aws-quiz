import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../context/AuthContext';

const CATEGORIES = ['All', 'Compute', 'Serverless', 'Storage', 'Database', 'Networking', 'Messaging', 'Security', 'DevOps', 'Management', 'Analytics', 'Integration', 'Developer Tools', 'Containers'];

const SERVICE_ICONS = {
  ec2: '🖥️', ecr: '📦', ecs: '🐳', beanstalk: '🌱', lambda: 'λ',
  elb: '⚖️', cloudfront: '🌐', kinesis: '🌊', route53: '🔀', s3: '🪣',
  rds: '🗄️', aurora: '⚡', dynamodb: '💎', elasticache: '⚡', sqs: '📨',
  sns: '📣', stepfunctions: '🔄', autoscaling: '📈', apigateway: '🚪', ses: '✉️',
  cognito: '🔑', iam: '🛡️', cloudwatch: '👁️', systemsmanager: '🔧', cloudformation: '🏗️',
  cloudtrail: '👣', codecommit: '💾', codebuild: '🔨', codedeploy: '🚀', codepipeline: '🔁',
  xray: '🔬', kms: '🔐',
};

const DIFF_ORDER = { foundation: 0, associate: 1, advanced: 2, expert: 3 };

export default function Services() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/quiz/services').then(res => {
      setServices(res.data.services);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const filtered = services.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.id.toLowerCase().includes(search.toLowerCase());
    const matchCat = category === 'All' || s.category === category;
    return matchSearch && matchCat;
  });

  const getAccuracy = (p) => {
    if (!p || p.questions_attempted === 0) return null;
    return Math.round((p.questions_correct / p.questions_attempted) * 100);
  };

  const getDiffLabel = (p) => p?.current_difficulty || 'foundation';

  if (loading) return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
      {[...Array(12)].map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 130, borderRadius: 12 }} />
      ))}
    </div>
  );

  return (
    <div style={{ maxWidth: 1100, animation: 'fadeIn 0.4s ease' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, marginBottom: 6 }}>
          AWS Services
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          {services.length} services · Select one to start adaptive quiz
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="input"
          placeholder="Search services..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: 240, padding: '9px 14px', fontSize: 13 }}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {CATEGORIES.map(cat => (
            <button key={cat} onClick={() => setCategory(cat)}
              style={{
                padding: '6px 12px', borderRadius: 20, border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 12,
                transition: 'all 0.2s',
                background: category === cat ? 'var(--accent-orange)' : 'var(--bg-card)',
                color: category === cat ? '#000' : 'var(--text-secondary)',
                border: category === cat ? 'none' : '1px solid var(--border)',
              }}>{cat}
            </button>
          ))}
        </div>
      </div>

      {/* Summary stats */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: 'Not Started', count: services.filter(s => !s.progress).length, color: 'var(--text-muted)' },
          { label: 'In Progress', count: services.filter(s => s.progress && !s.progress.is_completed).length, color: 'var(--accent-orange)' },
          { label: 'Completed', count: services.filter(s => s.progress?.is_completed).length, color: 'var(--accent-green)' },
        ].map(stat => (
          <div key={stat.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: stat.color }} />
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              <span style={{ fontFamily: 'var(--font-mono)', color: stat.color, fontWeight: 700 }}>{stat.count}</span> {stat.label}
            </span>
          </div>
        ))}
      </div>

      {/* Service grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
        {filtered.map(svc => {
          const acc = getAccuracy(svc.progress);
          const diff = getDiffLabel(svc.progress);
          const attempted = svc.progress?.questions_attempted || 0;
          const score = svc.progress?.total_score || 0;
          const hasProgress = !!svc.progress;
          const progressPct = Math.min((attempted / 10) * 100, 100);

          return (
            <div key={svc.id}
              className="card"
              onClick={() => navigate(`/quiz/${svc.id}`)}
              style={{
                padding: '18px 20px', cursor: 'pointer',
                borderColor: hasProgress ? 'var(--border-bright)' : 'var(--border)',
                position: 'relative', overflow: 'hidden',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.borderColor = svc.color || 'var(--accent-orange)';
                e.currentTarget.style.boxShadow = `0 8px 24px rgba(0,0,0,0.3)`;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = hasProgress ? 'var(--border-bright)' : 'var(--border)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              {/* Color accent strip */}
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                background: hasProgress ? (svc.color || 'var(--accent-orange)') : 'transparent',
                transition: 'background 0.2s',
              }} />

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: `${svc.color}18`,
                  border: `1px solid ${svc.color}40`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, flexShrink: 0,
                }}>
                  {SERVICE_ICONS[svc.id] || '☁️'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2, lineHeight: 1.3 }}>
                    {svc.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {svc.category}
                  </div>
                </div>
              </div>

              {hasProgress ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span className={`tag tag-${diff}`}>{diff}</span>
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent-orange)', fontWeight: 700 }}>
                      {score}pts
                    </span>
                  </div>
                  <div className="progress-bar" style={{ marginBottom: 6 }}>
                    <div className="progress-fill" style={{
                      width: `${progressPct}%`,
                      background: svc.color || 'var(--accent-orange)',
                      opacity: 0.8,
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    <span>{attempted} questions</span>
                    {acc !== null && <span>{acc}% acc</span>}
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-muted)' }} />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Not started</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
          <p>No services found for "{search}"</p>
        </div>
      )}
    </div>
  );
}
