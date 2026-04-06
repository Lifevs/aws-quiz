import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../context/AuthContext';

const DIFF_COLORS = {
  foundation: '#00FF88', associate: '#00D4FF', advanced: '#FF9900', expert: '#FF4444',
};
const DIFF_LABELS = {
  foundation: 'Foundation', associate: 'Associate', advanced: 'Advanced', expert: 'Expert',
};
const DIFF_DESC = {
  foundation: 'Basic concepts & definitions',
  associate: 'Practical developer scenarios',
  advanced: 'Complex architectures & optimization',
  expert: 'Expert-level exam questions',
};

const TOTAL_QUESTIONS = 10;

export default function Quiz() {
  const { serviceId } = useParams();
  const navigate = useNavigate();

  const [serviceInfo, setServiceInfo] = useState(null);
  const [question, setQuestion] = useState(null);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [answered, setAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(null);
  const [sessionStats, setSessionStats] = useState({ correct: 0, wrong: 0, score: 0 });
  const [questionCount, setQuestionCount] = useState(0);
  const [sessionDone, setSessionDone] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [difficulty, setDifficulty] = useState('foundation');
  const [lastResult, setLastResult] = useState(undefined);
  const [error, setError] = useState('');
  const [sessionHistory, setSessionHistory] = useState([]);

  const questionRef = useRef(null);

  // Load service info
  useEffect(() => {
    api.get('/quiz/services').then(res => {
      const svc = res.data.services.find(s => s.id === serviceId);
      if (svc) setServiceInfo(svc);
      else navigate('/services');
    }).catch(() => navigate('/services'));
  }, [serviceId, navigate]);

  const fetchQuestion = useCallback(async (prevResult) => {
    if (questionCount >= TOTAL_QUESTIONS) { setSessionDone(true); return; }
    setLoading(true);
    setSelected(null);
    setAnswered(false);
    setIsCorrect(null);
    setShowExplanation(false);
    setError('');

    try {
      const res = await api.post(`/quiz/services/${serviceId}/question`, {
        previousResult: prevResult,
      });
      setQuestion(res.data.question);
      setDifficulty(res.data.difficulty);
      setProgress(res.data.progress);
      // scroll to top of question
      setTimeout(() => questionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate question. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [serviceId, questionCount]);

  useEffect(() => {
    fetchQuestion(undefined);
  }, [serviceId]); // eslint-disable-line

  const handleSelect = (option) => {
    if (answered) return;
    setSelected(option);
  };

  const handleSubmit = async () => {
    if (!selected || answered || !question) return;
    const correct = selected === question.correct;
    setAnswered(true);
    setIsCorrect(correct);
    setShowExplanation(true);
    setLastResult(correct);

    const scoreGain = correct
      ? (difficulty === 'foundation' ? 10 : difficulty === 'associate' ? 20 : difficulty === 'advanced' ? 35 : 50)
      : 0;

    setSessionStats(prev => ({
      correct: prev.correct + (correct ? 1 : 0),
      wrong: prev.wrong + (correct ? 0 : 1),
      score: prev.score + scoreGain,
    }));

    setSessionHistory(prev => [...prev, {
      question: question.question,
      correct,
      difficulty,
      selected,
      correctAnswer: question.correct,
    }]);

    try {
      await api.post(`/quiz/services/${serviceId}/answer`, {
        questionHash: question.hash,
        selectedOption: selected,
        correctOption: question.correct,
        difficulty,
      });
    } catch (err) {
      console.error('Answer submit error:', err);
    }
  };

  const handleNext = () => {
    const newCount = questionCount + 1;
    setQuestionCount(newCount);
    if (newCount >= TOTAL_QUESTIONS) {
      setSessionDone(true);
    } else {
      fetchQuestion(lastResult);
    }
  };

  const handleRestart = () => {
    setQuestionCount(0);
    setSessionStats({ correct: 0, wrong: 0, score: 0 });
    setSessionDone(false);
    setSessionHistory([]);
    setLastResult(undefined);
    fetchQuestion(undefined);
  };

  const diffColor = DIFF_COLORS[difficulty] || '#00D4FF';
  const accuracy = sessionStats.correct + sessionStats.wrong > 0
    ? Math.round((sessionStats.correct / (sessionStats.correct + sessionStats.wrong)) * 100)
    : 0;

  // SESSION COMPLETE SCREEN
  if (sessionDone) {
    const grade = accuracy >= 90 ? 'S' : accuracy >= 75 ? 'A' : accuracy >= 60 ? 'B' : accuracy >= 45 ? 'C' : 'D';
    const gradeColor = accuracy >= 90 ? '#FFD700' : accuracy >= 75 ? '#00FF88' : accuracy >= 60 ? '#00D4FF' : accuracy >= 45 ? '#FF9900' : '#FF4444';
    return (
      <div style={{ maxWidth: 700, margin: '0 auto', animation: 'fadeIn 0.5s ease' }}>
        <div className="card" style={{ padding: '40px', textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 90, height: 90, borderRadius: '50%',
            border: `3px solid ${gradeColor}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
            fontSize: 40, fontFamily: 'var(--font-display)', fontWeight: 800,
            color: gradeColor,
            boxShadow: `0 0 40px ${gradeColor}40`,
          }}>{grade}</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 800, marginBottom: 8 }}>
            Session Complete!
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 28, fontSize: 14 }}>
            {serviceInfo?.name} · {TOTAL_QUESTIONS} questions
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
            {[
              { label: 'Score', value: sessionStats.score, unit: 'pts', color: 'var(--accent-orange)' },
              { label: 'Accuracy', value: `${accuracy}%`, unit: '', color: accuracy >= 70 ? 'var(--accent-green)' : 'var(--accent-red)' },
              { label: 'Correct', value: `${sessionStats.correct}/${TOTAL_QUESTIONS}`, unit: '', color: 'var(--accent-cyan)' },
            ].map(stat => (
              <div key={stat.label} style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: '16px' }}>
                <div style={{ fontSize: 22, fontFamily: 'var(--font-mono)', fontWeight: 800, color: stat.color }}>
                  {stat.value}{stat.unit}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{stat.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button onClick={handleRestart} className="btn btn-primary">
              Practice Again
            </button>
            <button onClick={() => navigate('/services')} className="btn btn-ghost">
              All Services
            </button>
            <button onClick={() => navigate('/dashboard')} className="btn btn-ghost">
              Dashboard
            </button>
          </div>
        </div>

        {/* Session history */}
        <div className="card" style={{ padding: '20px 24px' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, marginBottom: 16 }}>
            Question Review
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sessionHistory.map((h, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 12px',
                borderRadius: 8, background: h.correct ? 'rgba(0,255,136,0.05)' : 'rgba(255,68,68,0.05)',
                border: `1px solid ${h.correct ? 'rgba(0,255,136,0.15)' : 'rgba(255,68,68,0.15)'}`,
              }}>
                <span style={{ fontSize: 14, marginTop: 2 }}>{h.correct ? '✅' : '❌'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-primary)', marginBottom: 2, lineHeight: 1.4 }}>
                    {h.question.length > 100 ? h.question.substring(0, 100) + '...' : h.question}
                  </div>
                  <span className={`tag tag-${h.difficulty}`} style={{ fontSize: 10 }}>{h.difficulty}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 780, margin: '0 auto', animation: 'fadeIn 0.3s ease' }} ref={questionRef}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/services')} className="btn btn-ghost" style={{ padding: '7px 12px', fontSize: 13 }}>
          ← Back
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
            {serviceInfo?.name || serviceId}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className={`tag tag-${difficulty}`}>{DIFF_LABELS[difficulty]}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
            {questionCount + 1}/{TOTAL_QUESTIONS}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="progress-bar" style={{ height: 3, marginBottom: 24 }}>
        <div className="progress-fill" style={{
          width: `${(questionCount / TOTAL_QUESTIONS) * 100}%`,
          background: diffColor,
          transition: 'width 0.5s ease',
        }} />
      </div>

      {/* Session stats row */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Score', value: sessionStats.score, color: 'var(--accent-orange)' },
          { label: 'Correct', value: sessionStats.correct, color: 'var(--accent-green)' },
          { label: 'Wrong', value: sessionStats.wrong, color: 'var(--accent-red)' },
          { label: 'Accuracy', value: sessionStats.correct + sessionStats.wrong > 0 ? `${accuracy}%` : '–', color: 'var(--accent-cyan)' },
        ].map(s => (
          <div key={s.label} style={{ flex: 1, textAlign: 'center', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 4px' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 16, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Difficulty indicator */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
        background: `${diffColor}10`, border: `1px solid ${diffColor}30`,
        borderRadius: 8, marginBottom: 20,
      }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: diffColor, animation: !answered && !loading ? 'pulse 2s infinite' : 'none' }} />
        <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: diffColor, fontWeight: 600 }}>
          {DIFF_LABELS[difficulty]} Level
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>·</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{DIFF_DESC[difficulty]}</span>
      </div>

      {/* Error state */}
      {error && !loading && (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <div style={{ color: 'var(--accent-red)', marginBottom: 12, fontSize: 14 }}>{error}</div>
          <button onClick={() => fetchQuestion(lastResult)} className="btn btn-primary">Retry</button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="card" style={{ padding: '48px', textAlign: 'center' }}>
          <div style={{
            width: 44, height: 44, border: `3px solid var(--border)`,
            borderTopColor: diffColor,
            borderRadius: '50%', animation: 'spin 0.8s linear infinite',
            margin: '0 auto 16px',
          }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, fontFamily: 'var(--font-mono)' }}>
            Generating {DIFF_LABELS[difficulty]} question...
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 6 }}>
            AI is adapting to your performance
          </p>
        </div>
      )}

      {/* Question card */}
      {!loading && !error && question && (
        <div>
          <div className="card" style={{
            padding: '28px',
            animation: 'fadeIn 0.4s ease',
            borderColor: answered ? (isCorrect ? 'rgba(0,255,136,0.3)' : 'rgba(255,68,68,0.3)') : 'var(--border)',
            transition: 'border-color 0.3s',
          }}>
            {/* Question number + topic */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                Q{questionCount + 1} of {TOTAL_QUESTIONS}
              </span>
              {question.topic && (
                <span style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 4,
                  background: 'var(--bg-secondary)', color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                }}>{question.topic}</span>
              )}
            </div>

            {/* Question text */}
            <p style={{
              fontSize: 16, lineHeight: 1.6, color: 'var(--text-primary)',
              marginBottom: 24, fontWeight: 500,
            }}>
              {question.question}
            </p>

            {/* Options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(question.options).map(([key, value]) => {
                let bg = 'var(--bg-secondary)';
                let border = 'var(--border)';
                let color = 'var(--text-primary)';
                let icon = null;

                if (answered) {
                  if (key === question.correct) {
                    bg = 'rgba(0,255,136,0.1)';
                    border = 'rgba(0,255,136,0.5)';
                    color = '#00FF88';
                    icon = '✓';
                  } else if (key === selected && key !== question.correct) {
                    bg = 'rgba(255,68,68,0.1)';
                    border = 'rgba(255,68,68,0.5)';
                    color = '#FF4444';
                    icon = '✗';
                  }
                } else if (selected === key) {
                  bg = `${diffColor}15`;
                  border = `${diffColor}60`;
                  color = diffColor;
                }

                return (
                  <button key={key}
                    onClick={() => handleSelect(key)}
                    disabled={answered}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 12,
                      padding: '14px 16px', borderRadius: 8, border: `1px solid ${border}`,
                      background: bg, cursor: answered ? 'default' : 'pointer',
                      textAlign: 'left', transition: 'all 0.2s', width: '100%',
                      color,
                    }}
                    onMouseEnter={e => { if (!answered) e.currentTarget.style.borderColor = diffColor; }}
                    onMouseLeave={e => { if (!answered && selected !== key) e.currentTarget.style.borderColor = 'var(--border)'; }}
                  >
                    <span style={{
                      flexShrink: 0, width: 26, height: 26, borderRadius: 6,
                      border: `1px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12,
                      background: selected === key || (answered && key === question.correct) ? bg : 'transparent',
                      color,
                    }}>
                      {icon || key}
                    </span>
                    <span style={{ fontSize: 14, lineHeight: 1.5 }}>{value}</span>
                  </button>
                );
              })}
            </div>

            {/* Submit / Next */}
            <div style={{ marginTop: 20, display: 'flex', gap: 12, alignItems: 'center' }}>
              {!answered ? (
                <button
                  onClick={handleSubmit}
                  disabled={!selected}
                  className="btn btn-primary"
                  style={{ opacity: selected ? 1 : 0.4, padding: '11px 24px' }}>
                  Submit Answer
                </button>
              ) : (
                <button onClick={handleNext} className="btn btn-cyan" style={{ padding: '11px 24px' }}>
                  {questionCount + 1 >= TOTAL_QUESTIONS ? 'View Results →' : 'Next Question →'}
                </button>
              )}
              {answered && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 14px', borderRadius: 8,
                  background: isCorrect ? 'rgba(0,255,136,0.1)' : 'rgba(255,68,68,0.1)',
                }}>
                  <span style={{ fontSize: 16 }}>{isCorrect ? '🎯' : '💡'}</span>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13,
                    color: isCorrect ? 'var(--accent-green)' : 'var(--accent-red)',
                  }}>
                    {isCorrect ? `+${sessionStats.score > 0 ? (difficulty === 'foundation' ? 10 : difficulty === 'associate' ? 20 : difficulty === 'advanced' ? 35 : 50) : 0}pts` : 'Incorrect'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Explanation */}
          {showExplanation && question.explanation && (
            <div className="card" style={{
              padding: '20px 24px', marginTop: 12,
              background: 'rgba(0,212,255,0.04)',
              borderColor: 'rgba(0,212,255,0.2)',
              animation: 'fadeIn 0.3s ease',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 14 }}>📖</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--accent-cyan)' }}>
                  EXPLANATION
                </span>
              </div>
              <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
                {question.explanation}
              </p>
            </div>
          )}

          {/* Adaptive hint */}
          {answered && (
            <div style={{
              padding: '10px 14px', marginTop: 10, borderRadius: 8,
              background: 'var(--bg-secondary)', border: '1px solid var(--border)',
              fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span>🤖</span>
              <span>
                {isCorrect
                  ? 'Great! Difficulty may increase on next question.'
                  : 'No worries! Difficulty may decrease to reinforce fundamentals.'}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
