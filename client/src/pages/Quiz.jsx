import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../context/AuthContext';

export default function Quiz() {
  const { serviceId: examId } = useParams(); // Using routing parameter as examId
  const navigate = useNavigate();

  // Core state
  const [exam, setExam] = useState(null);
  const [questions, setQuestions] = useState({}); // Stores question data by index: { [index]: questionObj }
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [questionLoading, setQuestionLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  
  // Timer state
  const [secondsLeft, setSecondsLeft] = useState(null);
  const timerIntervalRef = useRef(null);

  // Local answer selection & flagging state
  const [selectedAnswer, setSelectedAnswer] = useState('');
  const [flaggedQuestions, setFlaggedQuestions] = useState({}); // { [index]: true }

  // Review & AI Mentor state
  const [userExplanation, setUserExplanation] = useState('');
  const [evaluationText, setEvaluationText] = useState('');
  const [understandingScore, setUnderstandingScore] = useState(null);
  const [isEvaluating, setIsEvaluating] = useState(false);

  // Load exam and initial questions
  const fetchExam = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/quiz/exams/${examId}`);
      const examData = res.data.exam;
      setExam(examData);

      // Pre-fill answers from already answered questions returned from GET `/exams/:examId`
      const qsMap = {};
      const flaggedMap = {};
      res.data.questions?.forEach(q => {
        qsMap[q.question_index] = {
          $id: q.$id,
          question_index: q.question_index,
          domain: q.domain,
          question: q.question_text,
          options: JSON.parse(q.options),
          correct: examData.status === 'completed' ? q.correct_option : undefined,
          selected_option: q.selected_option,
          explanation: examData.status === 'completed' ? q.explanation : undefined,
          user_explanation: q.user_explanation,
          understanding_score: q.understanding_score,
          mentor_feedback: q.mentor_feedback
        };
      });
      setQuestions(qsMap);

      if (examData.status === 'in_progress') {
        // Calculate remaining seconds
        const start = new Date(examData.created_at);
        const totalAllowedSeconds = examData.total_questions * 120; // 2 minutes per question
        const elapsed = Math.floor((new Date() - start) / 1000);
        const remaining = Math.max(0, totalAllowedSeconds - elapsed);
        setSecondsLeft(remaining);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load exam simulation.');
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => {
    fetchExam();
  }, [fetchExam]);

  // Timer Countdown Effect
  useEffect(() => {
    if (exam && exam.status === 'in_progress' && secondsLeft !== null) {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      
      timerIntervalRef.current = setInterval(() => {
        setSecondsLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerIntervalRef.current);
            handleSubmitExam(true); // Auto submit on expiration
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [exam, secondsLeft]);

  // Load a question when changing currentIndex
  useEffect(() => {
    if (!exam) return;

    // Clear AI mentor states on index change
    setUserExplanation('');
    setEvaluationText('');
    setUnderstandingScore(null);
    setIsEvaluating(false);

    // If already loaded in state, set local answer
    if (questions[currentIndex]) {
      setSelectedAnswer(questions[currentIndex].selected_option || '');
      // If AI mentor feedback exists, load it
      if (questions[currentIndex].mentor_feedback) {
        setEvaluationText(questions[currentIndex].mentor_feedback);
        setUnderstandingScore(questions[currentIndex].understanding_score);
      }
      return;
    }

    // Fetch from server
    setQuestionLoading(true);
    api.get(`/quiz/exams/${examId}/questions/${currentIndex}`)
      .then(res => {
        const q = res.data.question;
        setQuestions(prev => ({ ...prev, [currentIndex]: q }));
        setSelectedAnswer(q.selected_option || '');
        if (q.mentor_feedback) {
          setEvaluationText(q.mentor_feedback);
          setUnderstandingScore(q.understanding_score);
        }
      })
      .catch(err => {
        console.error(err);
        setError('Failed to load question from server.');
      })
      .finally(() => {
        setQuestionLoading(false);
      });
  }, [currentIndex, exam, examId]);

  // Handle Answer Selection
  const handleSelectOption = async (option) => {
    if (!exam || exam.status === 'completed') return;

    setSelectedAnswer(option);
    
    // Update local state dictionary
    setQuestions(prev => {
      const q = prev[currentIndex];
      if (q) {
        return { ...prev, [currentIndex]: { ...q, selected_option: option } };
      }
      return prev;
    });

    try {
      await api.post(`/quiz/exams/${examId}/questions/${currentIndex}/answer`, {
        selectedOption: option
      });
    } catch (err) {
      console.error('Failed to save answer:', err);
    }
  };

  // Toggle Flag
  const toggleFlag = () => {
    setFlaggedQuestions(prev => ({
      ...prev,
      [currentIndex]: !prev[currentIndex]
    }));
  };

  // Submit Exam
  const handleSubmitExam = async (isTimeExpired = false) => {
    if (submitting) return;

    const unansweredCount = exam.total_questions - Object.values(questions).filter(q => q.selected_option).length;
    
    if (!isTimeExpired && unansweredCount > 0) {
      const confirmSubmit = window.confirm(`You have ${unansweredCount} unanswered questions. Are you sure you want to submit the exam?`);
      if (!confirmSubmit) return;
    }

    setSubmitting(true);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

    // Calculate time taken
    const start = new Date(exam.created_at);
    const elapsedSeconds = Math.floor((new Date() - start) / 1000);
    const timeTaken = Math.min(exam.total_questions * 120, elapsedSeconds);

    try {
      const res = await api.post(`/quiz/exams/${examId}/submit`, { timeTaken });
      setExam(res.data.exam);
      // Reload exam to fetch all correct options and explanations
      fetchExam();
    } catch (err) {
      console.error(err);
      alert('Failed to submit exam. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Explanation to AI Mentor (Review mode only)
  const handleMentorEvaluate = async () => {
    const q = questions[currentIndex];
    if (!q || !userExplanation.trim() || isEvaluating) return;

    setIsEvaluating(true);
    setEvaluationText('');
    setUnderstandingScore(null);

    try {
      const response = await fetch(`${api.defaults.baseURL}/quiz/exams/${examId}/questions/${currentIndex}/evaluate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': api.defaults.headers.common['Authorization'] || `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ userExplanation })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false;
      let fullText = '';

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          fullText += chunk;
          
          const scoreMatch = fullText.match(/\[\[SCORE:\s*(\d+)\]\]/);
          if (scoreMatch) {
            setUnderstandingScore(parseInt(scoreMatch[1], 10));
            setEvaluationText(fullText.replace(/\[\[SCORE:\s*\d+\]\]/, '').trim());
          } else {
            setEvaluationText(fullText);
          }
        }
      }
      setIsEvaluating(false);

      // Cache evaluation details in state questions map
      setQuestions(prev => ({
        ...prev,
        [currentIndex]: {
          ...prev[currentIndex],
          user_explanation: userExplanation,
          understanding_score: parseInt(fullText.match(/\[\[SCORE:\s*(\d+)\]\]/)?.[1] || '0', 10),
          mentor_feedback: fullText.replace(/\[\[SCORE:\s*\d+\]\]/, '').trim()
        }
      }));
    } catch (err) {
      console.error('Mentor evaluation error:', err);
      setIsEvaluating(false);
      setEvaluationText('Error connecting to the AI mentor.');
    }
  };

  // Helper formatting functions
  const formatTimer = (secs) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getDomainBreakdown = () => {
    const breakdown = {};
    Object.values(questions).forEach(q => {
      if (!q.domain) return;
      if (!breakdown[q.domain]) {
        breakdown[q.domain] = { total: 0, correct: 0 };
      }
      breakdown[q.domain].total++;
      if (q.selected_option === q.correct) {
        breakdown[q.domain].correct++;
      }
    });
    return Object.entries(breakdown).map(([name, stats]) => ({
      name,
      pct: Math.round((stats.correct / stats.total) * 100),
      correct: stats.correct,
      total: stats.total
    }));
  };

  if (loading) return (
    <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
      <div className="skeleton" style={{ width: 48, height: 48, borderRadius: '50%', margin: '0 auto 16px' }} />
      <p style={{ color: 'var(--text-secondary)' }}>Loading exam simulation...</p>
    </div>
  );

  if (error) return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <div style={{ color: 'var(--accent-red)', marginBottom: 12 }}>{error}</div>
      <button onClick={() => navigate('/services')} className="btn btn-primary">Back to Exam Center</button>
    </div>
  );

  const isCompleted = exam.status === 'completed' || exam.status === 'pass' || exam.status === 'fail';

  // ==================== VIEW 1: EXAM SIMULATION (IN PROGRESS) ====================
  if (!isCompleted) {
    const unansweredCount = exam.total_questions - Object.values(questions).filter(q => q.selected_option).length;
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 24, animation: 'fadeIn 0.4s ease' }}>
        
        {/* Sidebar: Navigation grid */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ padding: '16px' }}>
            <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, fontFamily: 'var(--font-display)' }}>Exam Progress</h4>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
              {Array.from({ length: exam.total_questions }).map((_, idx) => {
                const isCurrent = idx === currentIndex;
                const isAnswered = !!questions[idx]?.selected_option;
                const isFlagged = !!flaggedQuestions[idx];
                
                let background = 'var(--bg-secondary)';
                let border = '1px solid var(--border)';
                let color = 'var(--text-secondary)';

                if (isAnswered) {
                  background = 'rgba(0, 212, 255, 0.1)';
                  border = '1px solid var(--accent-cyan)';
                  color = 'var(--accent-cyan)';
                }
                if (isFlagged) {
                  border = '1px solid var(--accent-orange)';
                  if (!isAnswered) {
                    background = 'rgba(255, 153, 0, 0.05)';
                    color = 'var(--accent-orange)';
                  }
                }
                if (isCurrent) {
                  border = '2px solid white';
                  color = 'white';
                }

                return (
                  <button
                    key={idx}
                    onClick={() => setCurrentIndex(idx)}
                    style={{
                      height: 38,
                      borderRadius: 8,
                      background,
                      border,
                      color,
                      fontSize: 12,
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative'
                    }}
                  >
                    {idx + 1}
                    {isFlagged && <span style={{ position: 'absolute', top: 1, right: 2, fontSize: 8 }}>🚩</span>}
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }} />
                <span>Unanswered</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(0, 212, 255, 0.1)', border: '1px solid var(--accent-cyan)' }} />
                <span>Answered</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(255, 153, 0, 0.05)', border: '1px solid var(--accent-orange)' }} />
                <span>Flagged</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => handleSubmitExam(false)}
            disabled={submitting}
            className="btn btn-primary"
            style={{ width: '100%', padding: '12px', justifyContent: 'center' }}
          >
            Submit Simulation Exam
          </button>
        </aside>

        {/* Main Content Area */}
        <div style={{ minWidth: 0 }}>
          
          {/* Top Info Bar */}
          <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', marginBottom: 20 }}>
            <div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>AWS Certified Developer Simulation</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Remaining:</span>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 16,
                fontWeight: 800,
                color: secondsLeft < 300 ? 'var(--accent-red)' : 'var(--accent-orange)',
                background: 'var(--bg-secondary)',
                padding: '6px 12px',
                borderRadius: 8,
                border: `1px solid ${secondsLeft < 300 ? 'rgba(255,68,68,0.2)' : 'var(--border)'}`
              }}>
                {secondsLeft !== null ? formatTimer(secondsLeft) : '--:--:--'}
              </span>
            </div>
          </div>

          {/* Question Render Card */}
          {questionLoading ? (
            <div className="card" style={{ padding: '60px', textAlign: 'center' }}>
              <div style={{ width: 32, height: 32, border: '3px solid var(--border)', borderTopColor: 'var(--accent-orange)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
              <p style={{ color: 'var(--text-muted)' }}>Loading simulation question...</p>
            </div>
          ) : questions[currentIndex] ? (
            <div className="card" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                  Question {currentIndex + 1} of {exam.total_questions}
                </span>
                <span style={{
                  fontSize: 11, padding: '4px 10px', borderRadius: 999,
                  background: 'var(--bg-secondary)', color: 'var(--accent-orange)',
                  fontFamily: 'var(--font-mono)', fontWeight: 700
                }}>{questions[currentIndex].domain}</span>
              </div>

              <p className="quiz-question-text" style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 20 }}>
                {questions[currentIndex].question}
              </p>

              <div className="quiz-options" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                {Object.entries(questions[currentIndex].options).map(([key, value]) => {
                  const isSelected = selectedAnswer === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`quiz-option ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleSelectOption(key)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        textAlign: 'left',
                        padding: '14px 16px',
                        borderRadius: 10,
                        border: `1px solid ${isSelected ? 'var(--accent-orange)' : 'var(--border)'}`,
                        background: isSelected ? 'rgba(255,153,0,0.08)' : 'var(--bg-secondary)',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        color: 'var(--text-primary)',
                        gap: 12
                      }}
                    >
                      <span className="label" style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 24, height: 24, borderRadius: '50%',
                        background: isSelected ? 'var(--accent-orange)' : 'var(--border)',
                        color: isSelected ? '#000' : 'var(--text-secondary)',
                        fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)',
                        flexShrink: 0
                      }}>{key}</span>
                      <span style={{ fontSize: 13.5, lineHeight: 1.4 }}>{value}</span>
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  onClick={toggleFlag}
                  className="btn btn-ghost"
                  style={{
                    color: flaggedQuestions[currentIndex] ? 'var(--accent-orange)' : 'var(--text-muted)',
                    borderColor: flaggedQuestions[currentIndex] ? 'var(--accent-orange)' : 'transparent',
                    borderWidth: 1, borderStyle: 'solid'
                  }}
                >
                  🚩 {flaggedQuestions[currentIndex] ? 'Flagged for Review' : 'Flag for Review'}
                </button>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    disabled={currentIndex === 0}
                    onClick={() => setCurrentIndex(prev => prev - 1)}
                    className="btn btn-ghost"
                  >
                    Previous
                  </button>
                  <button
                    disabled={currentIndex === exam.total_questions - 1}
                    onClick={() => setCurrentIndex(prev => prev + 1)}
                    className="btn btn-ghost"
                  >
                    Next
                  </button>
                </div>
              </div>

            </div>
          ) : (
            <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
              <p style={{ color: 'var(--text-muted)' }}>Preparing simulation question...</p>
            </div>
          )}

        </div>
      </div>
    );
  }

  // ==================== VIEW 2: EXAM REVIEW (COMPLETED) ====================
  const score = exam.score;
  const isPassed = exam.status === 'pass';
  const domainBreakdown = getDomainBreakdown();

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 24, animation: 'fadeIn 0.4s ease' }}>
      
      {/* Left: Review navigator */}
      <aside style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card" style={{ padding: '16px' }}>
          <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, fontFamily: 'var(--font-display)' }}>Question Navigator</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
            {Array.from({ length: exam.total_questions }).map((_, idx) => {
              const isCurrent = idx === currentIndex;
              const q = questions[idx];
              const isCorrect = q && q.selected_option === q.correct;
              const isAnswered = q && !!q.selected_option;

              let border = '1px solid var(--border)';
              let background = 'var(--bg-secondary)';
              let color = 'var(--text-secondary)';

              if (isAnswered) {
                background = isCorrect ? 'rgba(0,255,136,0.1)' : 'rgba(255,68,68,0.1)';
                border = `1px solid ${isCorrect ? 'var(--accent-green)' : 'var(--accent-red)'}`;
                color = isCorrect ? 'var(--accent-green)' : 'var(--accent-red)';
              } else {
                background = 'rgba(255,68,68,0.05)';
                border = '1px solid var(--accent-red)';
                color = 'var(--accent-red)';
              }

              if (isCurrent) {
                border = '2px solid white';
                color = 'white';
              }

              return (
                <button
                  key={idx}
                  onClick={() => setCurrentIndex(idx)}
                  style={{
                    height: 38,
                    borderRadius: 8,
                    background,
                    border,
                    color,
                    fontSize: 12,
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </div>

        <button onClick={() => navigate('/services')} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
          Exam Center
        </button>
        <button onClick={() => navigate('/dashboard')} className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center' }}>
          Dashboard
        </button>
      </aside>

      {/* Right: Results Dashboard & Detailed Review */}
      <div style={{ minWidth: 0 }}>
        
        {/* Simulation Grade Card */}
        <div className="card" style={{
          padding: '24px',
          background: isPassed ? 'linear-gradient(135deg, rgba(0,255,136,0.08), rgba(0,0,0,0))' : 'linear-gradient(135deg, rgba(255,68,68,0.08), rgba(0,0,0,0))',
          borderColor: isPassed ? 'rgba(0,255,136,0.3)' : 'rgba(255,68,68,0.3)',
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 20,
          flexWrap: 'wrap'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <span style={{
                fontSize: 18,
                padding: '4px 10px',
                borderRadius: 8,
                background: isPassed ? 'rgba(0,255,136,0.1)' : 'rgba(255,68,68,0.1)',
                color: isPassed ? 'var(--accent-green)' : 'var(--accent-red)',
                fontWeight: 800,
                fontFamily: 'var(--font-mono)'
              }}>
                {isPassed ? 'PASS' : 'FAIL'}
              </span>
              <span style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>AWS DVA-C02 Score Report</span>
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>
              {isPassed ? 'Congratulations! You passed the simulation.' : 'You did not meet the passing criteria of 72%.'}
            </h2>
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ textAlign: 'center', background: 'var(--bg-secondary)', padding: '12px 18px', borderRadius: 10 }}>
              <div style={{ fontSize: 22, fontFamily: 'var(--font-mono)', fontWeight: 800, color: isPassed ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                {score}%
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Your Score</div>
            </div>
            <div style={{ textAlign: 'center', background: 'var(--bg-secondary)', padding: '12px 18px', borderRadius: 10 }}>
              <div style={{ fontSize: 22, fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--text-primary)' }}>
                {exam.correct_answers}/{exam.total_questions}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Correct</div>
            </div>
            <div style={{ textAlign: 'center', background: 'var(--bg-secondary)', padding: '12px 18px', borderRadius: 10 }}>
              <div style={{ fontSize: 22, fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--accent-cyan)' }}>
                {formatTime(exam.time_taken)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Time taken</div>
            </div>
          </div>
        </div>

        {/* Domain Percentage Breakdown */}
        <div className="card" style={{ padding: '20px 24px', marginBottom: 24 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>
            Domain Performance Review
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {domainBreakdown.map(dom => (
              <div key={dom.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{dom.name}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: dom.pct >= 72 ? 'var(--accent-green)' : 'var(--accent-orange)' }}>
                    {dom.pct}% ({dom.correct}/{dom.total})
                  </span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{
                    width: `${dom.pct}%`,
                    background: dom.pct >= 72 ? 'var(--accent-green)' : 'var(--accent-orange)'
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Question Details */}
        {questions[currentIndex] ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            
            <div className="card" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                  Question {currentIndex + 1} of {exam.total_questions}
                </span>
                <span style={{
                  fontSize: 11, padding: '4px 10px', borderRadius: 999,
                  background: 'var(--bg-secondary)', color: 'var(--accent-cyan)',
                  fontFamily: 'var(--font-mono)'
                }}>{questions[currentIndex].domain}</span>
              </div>

              <p className="quiz-question-text" style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 20 }}>
                {questions[currentIndex].question}
              </p>

              <div className="quiz-options" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                {Object.entries(questions[currentIndex].options).map(([key, value]) => {
                  const isSelected = selectedAnswer === key;
                  const isCorrect = questions[currentIndex].correct === key;
                  
                  let border = '1px solid var(--border)';
                  let background = 'var(--bg-secondary)';
                  let icon = null;

                  if (isCorrect) {
                    border = '1px solid var(--accent-green)';
                    background = 'rgba(0,255,136,0.08)';
                    icon = '✅';
                  } else if (isSelected && !isCorrect) {
                    border = '1px solid var(--accent-red)';
                    background = 'rgba(255,68,68,0.08)';
                    icon = '❌';
                  }

                  return (
                    <div
                      key={key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        textAlign: 'left',
                        padding: '14px 16px',
                        borderRadius: 10,
                        border,
                        background,
                        color: 'var(--text-primary)',
                        gap: 12
                      }}
                    >
                      <span className="label" style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 24, height: 24, borderRadius: '50%',
                        background: isCorrect ? 'var(--accent-green)' : (isSelected ? 'var(--accent-red)' : 'var(--border)'),
                        color: '#000',
                        fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)',
                        flexShrink: 0
                      }}>{key}</span>
                      <span style={{ fontSize: 13.5, lineHeight: 1.4, flex: 1 }}>{value}</span>
                      {icon && <span style={{ fontSize: 14 }}>{icon}</span>}
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  disabled={currentIndex === 0}
                  onClick={() => setCurrentIndex(prev => prev - 1)}
                  className="btn btn-ghost"
                >
                  Previous
                </button>
                <button
                  disabled={currentIndex === exam.total_questions - 1}
                  onClick={() => setCurrentIndex(prev => prev + 1)}
                  className="btn btn-ghost"
                >
                  Next
                </button>
              </div>
            </div>

            {/* AI Mentor evaluation details */}
            <div className="evaluation-board card" style={{ padding: '24px' }}>
              <div style={{ textAlign: 'center' }}>
                <h3 className="display" style={{ fontSize: '1.5rem', marginBottom: '8px' }}>AI Mentor Evaluation</h3>
                <p style={{ color: 'var(--text-secondary)' }}>Review your understanding. Write down your logic for this answer and get scored!</p>
              </div>

              <div className="speedometer-container" style={{ position: 'relative', width: 200, height: 100, margin: '20px auto 10px' }}>
                <svg width="200" height="100" viewBox="0 0 200 100">
                  <defs>
                    <linearGradient id="arcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="var(--accent-red)" />
                      <stop offset="50%" stopColor="var(--accent-orange)" />
                      <stop offset="100%" stopColor="var(--accent-green)" />
                    </linearGradient>
                  </defs>
                  <path d="M 10 100 A 90 90 0 0 1 190 100" fill="none" stroke="var(--bg-secondary)" strokeWidth="20" />
                  <path d="M 10 100 A 90 90 0 0 1 190 100" fill="none" stroke="url(#arcGrad)" strokeWidth="20" />
                </svg>
                <div 
                  style={{
                    position: 'absolute', bottom: 0, left: '50%',
                    width: 4, height: 75, background: 'white',
                    transformOrigin: 'bottom center',
                    transform: `translateX(-50%) rotate(${understandingScore !== null ? (understandingScore / 100) * 180 - 90 : -90}deg)`,
                    transition: 'transform 1.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
                    borderRadius: 2, zIndex: 2
                  }}
                >
                  <div style={{ position: 'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%)', width: 16, height: 16, borderRadius: '50%', background: 'white' }} />
                </div>
                <div className="speedometer-score" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, textAlign: 'center', zIndex: 3 }}>
                  <div className="speedometer-score-val" style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                    {understandingScore !== null ? understandingScore : '--'}
                  </div>
                  <div className="speedometer-score-label" style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Understanding</div>
                </div>
              </div>

              <div className="evaluation-analysis" style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: 10, fontSize: 13.5, lineHeight: 1.5, marginBottom: 20 }}>
                {evaluationText || 'Reviewing explanations aids retention. Submit your reasoning below to activate AI assessment.'}
                {isEvaluating && <span className="typing-cursor"></span>}
              </div>

              {understandingScore === null && !isEvaluating && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <textarea
                    placeholder="Provide your thought process. Explain why you picked your choice and why the distractors are wrong..."
                    value={userExplanation}
                    onChange={e => setUserExplanation(e.target.value)}
                    style={{
                      width: '100%',
                      minHeight: 80,
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      padding: 12,
                      color: 'white',
                      fontFamily: 'var(--font-body)',
                      fontSize: 13.5
                    }}
                  />
                  <button
                    onClick={handleMentorEvaluate}
                    disabled={!userExplanation.trim()}
                    className="btn btn-primary"
                    style={{ alignSelf: 'flex-end', fontSize: 13 }}
                  >
                    Submit to AI Mentor
                  </button>
                </div>
              )}
            </div>

            {/* Answer Explanation Card */}
            {questions[currentIndex].explanation && (
              <div className="card quiz-card alt quiz-explanation" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 16 }}>📖</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--accent-orange)' }}>
                    EXPLANATION
                  </span>
                </div>
                <p style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                  {questions[currentIndex].explanation}
                </p>
              </div>
            )}

          </div>
        ) : (
          <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
            <p style={{ color: 'var(--text-muted)' }}>Loading question review details...</p>
          </div>
        )}
      </div>
    </div>
  );
}
