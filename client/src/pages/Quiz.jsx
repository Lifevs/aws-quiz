import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../context/AuthContext';

const Speedometer = ({ score, pulse }) => {
  const radius = 54;
  const strokeWidth = 8;
  const circumference = 2 * Math.PI * radius;
  const displayScore = score !== null ? score : 0;
  const offset = circumference - (displayScore / 100) * circumference;
  
  let strokeColor = 'var(--accent-red)';
  if (displayScore >= 75) strokeColor = 'var(--accent-green)';
  else if (displayScore >= 50) strokeColor = 'var(--accent-orange)';
  else if (displayScore >= 25) strokeColor = 'var(--accent-cyan)';
  
  return (
    <div className="speedometer-container" style={{ width: 140, height: 140, display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
      <svg width="130" height="130" style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx="65"
          cy="65"
          r={radius}
          fill="transparent"
          stroke="var(--border)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx="65"
          cy="65"
          r={radius}
          fill="transparent"
          stroke={pulse ? 'var(--accent-cyan)' : strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={pulse ? circumference * 0.4 : offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease, stroke 0.5s ease' }}
        />
      </svg>
      <div className="speedometer-score" style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', left: '50%', transform: 'translateX(-50%)', bottom: 35 }}>
        <span className="speedometer-score-val" style={{ color: pulse ? 'var(--accent-cyan)' : strokeColor, fontSize: '1.8rem', fontWeight: 800, fontFamily: 'var(--font-display)' }}>
          {pulse ? '--' : `${displayScore}%`}
        </span>
        <span className="speedometer-score-label" style={{ fontSize: '7.5px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2, letterSpacing: '0.05em' }}>
          UNDERSTANDING
        </span>
      </div>
    </div>
  );
};

export default function Quiz() {
  const { examId } = useParams();
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

  // AI Mentor Evaluation State
  const [userExplanation, setUserExplanation] = useState('');
  const [evaluating, setEvaluating] = useState(false);
  const [evaluationFeedback, setEvaluationFeedback] = useState('');
  const [evaluationScore, setEvaluationScore] = useState(null);

  // Sync evaluation state when question index or database data changes
  useEffect(() => {
    const q = questions[currentIndex];
    if (q) {
      setUserExplanation(q.user_explanation || '');
      setEvaluationFeedback(q.mentor_feedback || '');
      setEvaluationScore(q.understanding_score !== undefined && q.understanding_score !== null && q.understanding_score > 0 ? q.understanding_score : null);
    } else {
      setUserExplanation('');
      setEvaluationFeedback('');
      setEvaluationScore(null);
    }
  }, [currentIndex, questions]);

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
          correct: examData.status !== 'in_progress' ? q.correct_option : undefined,
          selected_option: q.selected_option,
          explanation: examData.status !== 'in_progress' ? q.explanation : undefined,
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

    // If already loaded in state, set local answer
    if (questions[currentIndex]) {
      setSelectedAnswer(questions[currentIndex].selected_option || '');
      return;
    }

    // Fetch from server
    setQuestionLoading(true);
    api.get(`/quiz/exams/${examId}/questions/${currentIndex}`)
      .then(res => {
        const q = res.data.question;
        setQuestions(prev => ({ ...prev, [currentIndex]: q }));
        setSelectedAnswer(q.selected_option || '');
      })
      .catch(err => {
        console.error(err);
        setError('Failed to load question from server.');
      })
      .finally(() => {
        setQuestionLoading(false);
      });
  }, [currentIndex, exam, examId]);

  // Safe helper to parse JSON explanation
  const parseExplanation = (explanationStr) => {
    if (!explanationStr) return null;
    try {
      const parsed = JSON.parse(explanationStr);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    } catch (e) {
      // Ignore, fallback to plain text
    }
    return { overall: explanationStr, options: null };
  };

  // Handle Answer Selection
  const handleSelectOption = (option) => {
    if (!exam || exam.status !== 'in_progress') return;
    const q = questions[currentIndex];
    if (q && q.selected_option) return; // Answer already submitted and locked

    setSelectedAnswer(option);
  };

  // Submit Answer for the current question
  const handleSubmitAnswer = async () => {
    if (!exam || exam.status !== 'in_progress') return;
    if (!selectedAnswer) return;

    const q = questions[currentIndex];
    if (q && q.selected_option) return; // Already submitted

    try {
      const res = await api.post(`/quiz/exams/${examId}/questions/${currentIndex}/answer`, {
        selectedOption: selectedAnswer
      });

      // Update question state with returned correct option and explanation
      setQuestions(prev => {
        const currentQ = prev[currentIndex];
        if (currentQ) {
          return {
            ...prev,
            [currentIndex]: {
              ...currentQ,
              selected_option: selectedAnswer,
              correct: res.data.correct,
              explanation: res.data.explanation
            }
          };
        }
        return prev;
      });
    } catch (err) {
      console.error('Failed to submit answer:', err);
      alert('Failed to submit answer. Please try again.');
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



  const handleEvaluateExplanation = async () => {
    if (!userExplanation.trim()) return;

    setEvaluating(true);
    setEvaluationFeedback('');
    setEvaluationScore(null);

    try {
      const response = await fetch(`/api/quiz/exams/${examId}/questions/${currentIndex}/evaluate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ userExplanation })
      });

      if (!response.ok) {
        throw new Error('Failed to get evaluation feedback from mentor.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false;
      let streamedText = '';

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: !done });
          streamedText += chunk;
          
          // Parse score dynamically if present
          const scoreMatch = streamedText.match(/\[\[SCORE:\s*(\d+)\]\]/);
          let displayScore = null;
          let cleanText = streamedText;
          if (scoreMatch) {
            displayScore = parseInt(scoreMatch[1], 10);
            cleanText = cleanText.replace(/\[\[SCORE:\s*\d+\]\]/, '').trim();
          }

          setEvaluationFeedback(cleanText);
          if (displayScore !== null) {
            setEvaluationScore(displayScore);
          }
        }
      }

      // Final score check
      const scoreMatch = streamedText.match(/\[\[SCORE:\s*(\d+)\]\]/);
      let finalScore = 0;
      let finalCleanText = streamedText;
      if (scoreMatch) {
        finalScore = parseInt(scoreMatch[1], 10);
        finalCleanText = finalCleanText.replace(/\[\[SCORE:\s*\d+\]\]/, '').trim();
      }

      // Save to local state
      setQuestions(prev => {
        const currentQ = prev[currentIndex];
        if (currentQ) {
          return {
            ...prev,
            [currentIndex]: {
              ...currentQ,
              user_explanation: userExplanation,
              understanding_score: finalScore,
              mentor_feedback: finalCleanText
            }
          };
        }
        return prev;
      });
    } catch (err) {
      console.error(err);
      alert('Error during evaluation: ' + err.message);
    } finally {
      setEvaluating(false);
    }
  };

  const handleClearEvaluation = () => {
    setQuestions(prev => {
      const currentQ = prev[currentIndex];
      if (currentQ) {
        return {
          ...prev,
          [currentIndex]: {
            ...currentQ,
            user_explanation: '',
            understanding_score: 0,
            mentor_feedback: ''
          }
        };
      }
      return prev;
    });
    setUserExplanation('');
    setEvaluationFeedback('');
    setEvaluationScore(null);
  };

  // Helper formatting functions
  const formatTime = (secs) => {
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
      <button onClick={() => navigate('/exam-center')} className="btn btn-primary">Back to Exam Center</button>
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
                {secondsLeft !== null ? formatTime(secondsLeft) : '--:--:--'}
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

              <div className="quiz-options" style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
                {Object.entries(questions[currentIndex].options).map(([key, value]) => {
                  const isQuestionSubmitted = !!questions[currentIndex].selected_option;
                  const isSelected = selectedAnswer === key;
                  const correctOption = questions[currentIndex].correct;
                  const isCorrect = correctOption === key;

                  let border = '1px solid var(--border)';
                  let background = 'var(--bg-secondary)';
                  let labelBg = 'var(--border)';
                  let icon = null;

                  if (isQuestionSubmitted) {
                    if (isCorrect) {
                      border = '1px solid var(--accent-green)';
                      background = 'rgba(0, 255, 136, 0.05)';
                      labelBg = 'var(--accent-green)';
                      icon = '✅';
                    } else if (isSelected && !isCorrect) {
                      border = '1px solid var(--accent-red)';
                      background = 'rgba(255, 68, 68, 0.05)';
                      labelBg = 'var(--accent-red)';
                      icon = '❌';
                    }
                  } else {
                    if (isSelected) {
                      border = '1px solid var(--accent-orange)';
                      background = 'rgba(255, 153, 0, 0.08)';
                      labelBg = 'var(--accent-orange)';
                    }
                  }

                  const explanationObj = parseExplanation(questions[currentIndex].explanation);
                  const optionExplanation = explanationObj?.options?.[key];

                  return (
                    <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {isQuestionSubmitted ? (
                        <div
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
                            background: labelBg,
                            color: '#000',
                            fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)',
                            flexShrink: 0
                          }}>{key}</span>
                          <span style={{ fontSize: 13.5, lineHeight: 1.4, flex: 1 }}>{value}</span>
                          {icon && <span style={{ fontSize: 14 }}>{icon}</span>}
                        </div>
                      ) : (
                        <button
                          type="button"
                          className={`quiz-option ${isSelected ? 'selected' : ''}`}
                          onClick={() => handleSelectOption(key)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            textAlign: 'left',
                            padding: '14px 16px',
                            borderRadius: 10,
                            border,
                            background,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            color: 'var(--text-primary)',
                            gap: 12
                          }}
                        >
                          <span className="label" style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: 24, height: 24, borderRadius: '50%',
                            background: labelBg,
                            color: isSelected ? '#000' : 'var(--text-secondary)',
                            fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)',
                            flexShrink: 0
                          }}>{key}</span>
                          <span style={{ fontSize: 13.5, lineHeight: 1.4 }}>{value}</span>
                        </button>
                      )}

                      {isQuestionSubmitted && optionExplanation && (
                        <div style={{
                          padding: '12px 16px',
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                          background: 'rgba(255, 255, 255, 0.01)',
                          borderLeft: `4px solid ${isCorrect ? 'var(--accent-green)' : 'var(--accent-red)'}`,
                          fontSize: 13,
                          lineHeight: 1.5,
                          color: 'var(--text-secondary)',
                          marginLeft: 36,
                          marginTop: 2,
                          marginBottom: 8
                        }}>
                          {optionExplanation}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Correctness Banner */}
              {!!questions[currentIndex].selected_option && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '14px 18px',
                  borderRadius: 10,
                  background: questions[currentIndex].selected_option === questions[currentIndex].correct ? 'rgba(0,255,136,0.06)' : 'rgba(255,68,68,0.06)',
                  border: `1px solid ${questions[currentIndex].selected_option === questions[currentIndex].correct ? 'rgba(0,255,136,0.2)' : 'rgba(255,68,68,0.2)'}`,
                  marginTop: 20,
                  marginBottom: 16,
                  animation: 'fadeIn 0.3s ease'
                }}>
                  <span style={{ fontSize: 20 }}>{questions[currentIndex].selected_option === questions[currentIndex].correct ? '✅' : '❌'}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: questions[currentIndex].selected_option === questions[currentIndex].correct ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                      {questions[currentIndex].selected_option === questions[currentIndex].correct ? 'Correct' : 'Incorrect'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                      Your Answer: <strong style={{ fontFamily: 'var(--font-mono)' }}>{questions[currentIndex].selected_option}</strong> &bull; Correct Answer: <strong style={{ fontFamily: 'var(--font-mono)' }}>{questions[currentIndex].correct}</strong>
                    </div>
                  </div>
                </div>
              )}

              {/* Overall Explanation */}
              {!!questions[currentIndex].selected_option && (
                (() => {
                  const expl = parseExplanation(questions[currentIndex].explanation);
                  if (expl && expl.overall) {
                    return (
                      <div style={{
                        marginTop: 20,
                        padding: '16px 20px',
                        borderRadius: 10,
                        background: 'rgba(255, 153, 0, 0.02)',
                        border: '1px solid var(--border)',
                        borderLeft: '4px solid var(--accent-orange)',
                        animation: 'fadeIn 0.3s ease',
                        marginBottom: 20
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <span style={{ fontSize: 16 }}>📖</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 800, color: 'var(--accent-orange)', letterSpacing: '0.05em' }}>
                            OVERALL EXPLANATION
                          </span>
                        </div>
                        <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                          {expl.overall}
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
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

                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <button
                    disabled={currentIndex === 0}
                    onClick={() => setCurrentIndex(prev => prev - 1)}
                    className="btn btn-ghost"
                  >
                    Previous
                  </button>

                  {!questions[currentIndex].selected_option && (
                    <button
                      onClick={handleSubmitAnswer}
                      disabled={!selectedAnswer}
                      className="btn btn-primary"
                      style={{ padding: '8px 20px', fontWeight: 700 }}
                    >
                      Submit Answer
                    </button>
                  )}

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

        <button onClick={() => navigate('/exam-center')} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
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

              <div className="quiz-options" style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
                {Object.entries(questions[currentIndex].options).map(([key, value]) => {
                  const isSelected = selectedAnswer === key;
                  const isCorrect = questions[currentIndex].correct === key;

                  let border = '1px solid var(--border)';
                  let background = 'var(--bg-secondary)';
                  let labelBg = 'var(--border)';
                  let icon = null;

                  if (isCorrect) {
                    border = '1px solid var(--accent-green)';
                    background = 'rgba(0, 255, 136, 0.05)';
                    labelBg = 'var(--accent-green)';
                    icon = '✅';
                  } else if (isSelected && !isCorrect) {
                    border = '1px solid var(--accent-red)';
                    background = 'rgba(255, 68, 68, 0.05)';
                    labelBg = 'var(--accent-red)';
                    icon = '❌';
                  }

                  const explanationObj = parseExplanation(questions[currentIndex].explanation);
                  const optionExplanation = explanationObj?.options?.[key];

                  return (
                    <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div
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
                          background: labelBg,
                          color: '#000',
                          fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)',
                          flexShrink: 0
                        }}>{key}</span>
                        <span style={{ fontSize: 13.5, lineHeight: 1.4, flex: 1 }}>{value}</span>
                        {icon && <span style={{ fontSize: 14 }}>{icon}</span>}
                      </div>

                      {optionExplanation && (
                        <div style={{
                          padding: '12px 16px',
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                          background: 'rgba(255, 255, 255, 0.01)',
                          borderLeft: `4px solid ${isCorrect ? 'var(--accent-green)' : 'var(--accent-red)'}`,
                          fontSize: 13,
                          lineHeight: 1.5,
                          color: 'var(--text-secondary)',
                          marginLeft: 36,
                          marginTop: 2,
                          marginBottom: 8
                        }}>
                          {optionExplanation}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Correctness Banner */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 18px',
                borderRadius: 10,
                background: questions[currentIndex].selected_option === questions[currentIndex].correct ? 'rgba(0,255,136,0.06)' : 'rgba(255,68,68,0.06)',
                border: `1px solid ${questions[currentIndex].selected_option === questions[currentIndex].correct ? 'rgba(0,255,136,0.2)' : 'rgba(255,68,68,0.2)'}`,
                marginTop: 20,
                marginBottom: 16
              }}>
                <span style={{ fontSize: 20 }}>{questions[currentIndex].selected_option === questions[currentIndex].correct ? '✅' : '❌'}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: questions[currentIndex].selected_option === questions[currentIndex].correct ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                    {questions[currentIndex].selected_option === questions[currentIndex].correct ? 'Correct' : 'Incorrect'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    Your Answer: <strong style={{ fontFamily: 'var(--font-mono)' }}>{questions[currentIndex].selected_option || 'None'}</strong> &bull; Correct Answer: <strong style={{ fontFamily: 'var(--font-mono)' }}>{questions[currentIndex].correct}</strong>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
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

              {/* AWS Skill Builder Explanation Sheet Style */}
              {(() => {
                const expl = parseExplanation(questions[currentIndex].explanation);
                if (expl && expl.overall) {
                  return (
                    <div style={{
                      marginTop: 24,
                      padding: '20px',
                      borderRadius: 10,
                      background: 'rgba(255, 153, 0, 0.03)',
                      borderLeft: '4px solid var(--accent-orange)',
                      borderTop: '1px solid var(--border)',
                      borderRight: '1px solid var(--border)',
                      borderBottom: '1px solid var(--border)',
                      animation: 'fadeIn 0.3s ease'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <span style={{ fontSize: 16 }}>📖</span>
                        <span style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 12,
                          fontWeight: 800,
                          color: 'var(--accent-orange)',
                          letterSpacing: '0.05em'
                        }}>
                          OFFICIAL EXPLANATION
                        </span>
                      </div>
                      <div style={{
                        fontSize: 13.5,
                        lineHeight: 1.6,
                        color: 'var(--text-secondary)',
                        whiteSpace: 'pre-wrap'
                      }}>
                        {expl.overall}
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {/* AI Mentor Assessment Section */}
              <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 24 }}>
                <h4 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>🤖</span> AI Mentor Concept Evaluation
                </h4>
                
                {!evaluationFeedback && !evaluating ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5 }}>
                      Test your architectural reasoning! Explain in your own words why your selected option is correct or analyze the trade-offs of the distractors. The AI Mentor will evaluate your conceptual understanding.
                    </p>
                    <textarea
                      className="quiz-explanation-input"
                      value={userExplanation}
                      onChange={e => setUserExplanation(e.target.value)}
                      placeholder="Type your detailed explanation or reasoning for this question..."
                      style={{ margin: 0 }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        onClick={handleEvaluateExplanation}
                        disabled={!userExplanation.trim()}
                        className="btn btn-cyan"
                        style={{ padding: '10px 20px', fontSize: 13 }}
                      >
                        Ask AI Mentor to Evaluate ⚡
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="evaluation-board" style={{ marginTop: 12 }}>
                    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      {/* Left: Speedometer Gauge */}
                      <Speedometer score={evaluationScore} pulse={evaluating && evaluationScore === null} />
                      
                      {/* Right: Detailed feedback analysis */}
                      <div style={{ flex: 1, minWidth: 280 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>
                            {evaluating ? '🔄 EVALUATING THOUGHT PROCESS...' : '✅ EVALUATION COMPLETE'}
                          </span>
                          {!evaluating && (
                            <button
                              onClick={handleClearEvaluation}
                              className="btn btn-ghost"
                              style={{ fontSize: 11, padding: '4px 10px', height: 'auto' }}
                            >
                              Redo Explanation
                            </button>
                          )}
                        </div>
                        
                        <div className={`evaluation-analysis ${evaluating ? 'typing-cursor' : ''}`} style={{ fontSize: 13, lineHeight: 1.6 }}>
                          {evaluationFeedback || 'Preparing concept evaluation...'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

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
