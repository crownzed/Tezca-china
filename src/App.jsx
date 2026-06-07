import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  BookOpen, MessageCircle, Layers, Compass, Play, RefreshCw, CheckCircle2,
  Star, ChevronLeft, ChevronRight, Volume2, Copy, Check, Award, Zap,
  ArrowRight, RotateCcw, Brain, Target, TrendingUp, Clock, Bookmark,
  Search, PenTool, BarChart3, BookMarked, Bot, Mic
} from 'lucide-react';
import Header from './components/Header';
import SearchVocab from './components/SearchVocab';
import WritingCanvas from './components/WritingCanvas';
import Dashboard from './components/Dashboard';
import GrammarLessons from './components/GrammarLessons';
import MasteredReview from './components/MasteredReview';
import FreeChat from './components/FreeChat';
import AIChat from './components/AIChat';
import FlashcardFlip from './components/FlashcardFlip';
import QuizQuestionView from './components/QuizQuestionView';
import { isGrammarQuizType } from './grammar-quiz';
/* ─── Lazy-safe imports (will be populated by data.js) ─── */
let flashcardsData = [];
let chatScenarios = [];
let survivalGuides = [];
let quizQuestions = [];

import('./data').then(mod => {
  flashcardsData = mod.flashcardsData || [];
  chatScenarios = mod.chatScenarios || [];
  survivalGuides = mod.survivalGuides || [];
  quizQuestions = mod.quizQuestions || [];
}).catch(() => {});

/* ─── Toast Component ─── */
function Toast({ message, type = 'success', onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 2500);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className={`toast toast-${type}`}>
      {type === 'success' ? <Check size={16} /> : <Zap size={16} />}
      <span style={{ marginLeft: 8 }}>{message}</span>
    </div>
  );
}



/* ═══════════════════════════════════════════════════════════════
   FLASHCARD SYSTEM — Deep with SRS, stats, swipe, bookmark filter
   ═══════════════════════════════════════════════════════════════ */
function FlashcardSystem() {
  const [cards, setCards] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [hskFilter, setHskFilter] = useState('all');
  const [showBookmarked, setShowBookmarked] = useState(false);
  const [bookmarkedIds, setBookmarkedIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('bookmarkedIds')) || []; } catch { return []; }
  });
  const [topicFilter, setTopicFilter] = useState('all');
  const topicIcons = { pronoun: '👤', noun: '📦', verb: '🏃', adjective: '🎨', adverb: '⚡', measure_word: '📏', preposition: '🔗', conjunction: '🔄' };
  const topicLabels = { pronoun: 'Đại từ', noun: 'Danh từ', verb: 'Động từ', adjective: 'Tính từ', adverb: 'Trạng từ', measure_word: 'Lượng từ', preposition: 'Giới từ', conjunction: 'Liên từ' };
  const [learnedIds, setLearnedIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('learnedIds')) || []; } catch { return []; }
  });
  const [toast, setToast] = useState(null);
  const [slideDir, setSlideDir] = useState('right');

  useEffect(() => {
    import('./vocab-loader').then(mod => mod.loadAllFlashcards().then(setCards));
  }, []);

  const topics = [...new Set(cards.map(c => c.category).filter(Boolean))];
  const filteredCards = cards
    .filter(card => hskFilter === 'all' || card.hskLevel === parseInt(hskFilter))
    .filter(card => topicFilter === 'all' || card.category === topicFilter)
    .filter(card => !showBookmarked || bookmarkedIds.includes(card.id));

  const currentCard = filteredCards[currentIndex];
  const progress = filteredCards.length > 0 ? ((currentIndex + 1) / filteredCards.length) * 100 : 0;

  useEffect(() => {
    setFlipped(false);
  }, [currentIndex]);

  const goTo = useCallback((dir) => {
    setSlideDir(dir);
    if (dir === 'right') {
      setCurrentIndex(prev => (prev + 1) % filteredCards.length);
    } else {
      setCurrentIndex(prev => (prev - 1 + filteredCards.length) % filteredCards.length);
    }
  }, [filteredCards.length]);

  const handleFilterChange = level => {
    setHskFilter(level);
    setCurrentIndex(0);
    setFlipped(false);
  };

  const toggleBookmark = (e) => {
    e?.stopPropagation();
    if (!currentCard) return;
    const id = currentCard.id;
    setBookmarkedIds(prev => {
      const next = prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id];
      localStorage.setItem('bookmarkedIds', JSON.stringify(next));
      return next;
    });
    setToast({ msg: bookmarkedIds.includes(currentCard.id) ? 'Đã bỏ đánh dấu' : '⭐ Đã lưu vào mục yêu thích!', type: 'success' });
  };

  const playAudio = e => {
    e.stopPropagation();
    if (!currentCard) return;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(currentCard.character);
      u.lang = 'zh-CN';
      u.rate = 0.8;
      window.speechSynthesis.speak(u);
    }
  };

  const totalLearned = learnedIds.filter(id => filteredCards.some(c => c.id === id)).length;

  if (cards.length === 0) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Đang tải dữ liệu…</div>;
  if (filteredCards.length === 0) return (
    <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
      <p style={{ fontSize: '1.2rem', marginBottom: 16 }}>Không có từ vựng nào{showBookmarked ? ' được đánh dấu' : ''} cho cấp độ này.</p>
      {showBookmarked && <button className="btn-primary" onClick={() => setShowBookmarked(false)}>Xem tất cả</button>}
    </div>
  );

  return (
    <div style={{ maxWidth: 480, margin: '0 auto' }}>
      {/* Stats bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, justifyContent: 'center', flexWrap: 'wrap' }}>
        <div className="stat-card">
          <div className="stat-value">{filteredCards.length}</div>
          <div className="stat-label">Tổng thẻ</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--primary)' }}>{totalLearned}</div>
          <div className="stat-label">Đã thuộc</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--secondary)' }}>{bookmarkedIds.filter(id => filteredCards.some(c => c.id === id)).length}</div>
          <div className="stat-label">Yêu thích</div>
        </div>
      </div>

      {/* HSK Filter */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {['all', '1', '2', '3', '4', '5', '6'].map(level => (
          <button key={level} onClick={() => handleFilterChange(level)} style={{
            background: hskFilter === level ? 'var(--primary)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${hskFilter === level ? 'var(--primary)' : 'var(--glass-border)'}`,
            color: hskFilter === level ? '#fff' : 'var(--text-muted)',
            padding: '5px 12px', borderRadius: 'var(--radius-xl)',
            cursor: 'pointer', fontSize: '0.85rem', transition: 'var(--transition)', fontWeight: 600
          }}>
            {level === 'all' ? 'Tất cả' : `HSK ${level}`}
          </button>
        ))}
        <button onClick={() => setShowBookmarked(!showBookmarked)} style={{
          background: showBookmarked ? 'var(--secondary)' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${showBookmarked ? 'var(--secondary)' : 'var(--glass-border)'}`,
          color: showBookmarked ? '#000' : 'var(--text-muted)',
          padding: '5px 12px', borderRadius: 'var(--radius-xl)',
          cursor: 'pointer', fontSize: '0.85rem', transition: 'var(--transition)', fontWeight: 600
        }}>
          <Bookmark size={13} style={{ verticalAlign: 'middle', marginRight: 3 }} />
          Yêu thích
        </button>
      </div>

      {/* Topic filter */}
      {topics.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          <button key="all_topics" onClick={() => setTopicFilter('all')} style={{
            background: topicFilter === 'all' ? 'var(--info)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${topicFilter === 'all' ? 'var(--info)' : 'var(--glass-border)'}`,
            color: topicFilter === 'all' ? '#000' : 'var(--text-muted)',
            padding: '4px 10px', borderRadius: 'var(--radius-xl)',
            cursor: 'pointer', fontSize: '0.8rem', transition: 'var(--transition)', fontWeight: 600
          }}>
            📂 Tất cả
          </button>
          {topics.map(topic => (
            <button key={topic} onClick={() => setTopicFilter(topic)} style={{
              background: topicFilter === topic ? 'var(--info)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${topicFilter === topic ? 'var(--info)' : 'var(--glass-border)'}`,
              color: topicFilter === topic ? '#000' : 'var(--text-muted)',
              padding: '4px 10px', borderRadius: 'var(--radius-xl)',
              cursor: 'pointer', fontSize: '0.8rem', transition: 'var(--transition)', fontWeight: 500
            }}>
              {topicIcons[topic] || '📌'} {topicLabels[topic] || topic}
            </button>
          ))}
        </div>
      )}

      {/* Progress */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          <span>Thẻ {currentIndex + 1}/{filteredCards.length}</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="progress-bar-container">
          <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <FlashcardFlip
        card={currentCard}
        flipped={flipped}
        onFlip={() => setFlipped(f => !f)}
        bookmarked={bookmarkedIds.includes(currentCard.id)}
        onToggleBookmark={toggleBookmark}
        onPlayAudio={playAudio}
        enterFrom={slideDir}
      />

      {/* Navigation */}
      <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'center', alignItems: 'center' }}>
        <button className="btn-secondary" onClick={(e) => { e.stopPropagation(); goTo('left'); }} style={{ padding: '8px 10px' }}>
          <ChevronLeft size={18} />
        </button>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{currentIndex + 1} / {filteredCards.length}</span>
        <button className="btn-secondary" onClick={(e) => { e.stopPropagation(); goTo('right'); }} style={{ padding: '8px 10px' }}>
          <ChevronRight size={18} />
        </button>
      </div>

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ROLEPLAY CHAT — Multi-scenario, multi-step dialog trees, scoring
   ═══════════════════════════════════════════════════════════════ */
function RoleplayChat() {
  const [scenarios, setScenarios] = useState([]);
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [messages, setMessages] = useState([]);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [showOptions, setShowOptions] = useState(false);
  const [typing, setTyping] = useState(false);
  const [score, setScore] = useState(0);
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [completed, setCompleted] = useState(false);
  const [diffFilter, setDiffFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const chatRef = useRef(null);

  useEffect(() => {
    import('./data').then(mod => setScenarios(mod.chatScenarios || []));
  }, []);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, typing, feedback]);

  const speakText = (text, rate = 0.85) => {
    return new Promise((resolve) => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'zh-CN';
        u.rate = rate;
        u.onend = resolve;
        u.onerror = resolve;
        window.speechSynthesis.speak(u);
      } else {
        resolve();
      }
    });
  };

  const startScenario = async (scenario) => {
    setSelectedScenario(scenario);
    setMessages(scenario.messages || []);
    setCurrentStepIdx(0);
    setShowOptions(false);
    setScore(0);
    setTotalAttempts(0);
    setCompleted(false);
    setFeedback(null);
    // Phát âm tin nhắn đầu tiên rồi mới hiện options
    if (scenario.messages?.[0]?.text) {
      await speakText(scenario.messages[0].text);
    }
    setShowOptions(true);
  };

  const handleSelectOption = async (option, stepIdx) => {
    // Add user message + phát âm, chờ đọc xong
    setMessages(prev => [...prev, { sender: 'user', text: option.text, pinyin: option.pinyin, vi: option.vi }]);
    setShowOptions(false);
    setTotalAttempts(p => p + 1);
    await speakText(option.text);

    // Show feedback
    if (option.isCorrect) {
      setScore(p => p + 1);
      setFeedback({ type: 'correct', text: option.feedback || 'Chính xác! 🎉' });
    } else {
      setFeedback({ type: 'wrong', text: option.feedback || 'Chưa chính xác lắm 😅' });
    }

    // After feedback delay, show bot response
    await new Promise(r => setTimeout(r, 1200));
    setFeedback(null);
    setTyping(true);

    await new Promise(r => setTimeout(r, 800));
    const step = selectedScenario.steps?.[stepIdx];
    let botText = null;
    if (step?.botResponse) {
      setMessages(prev => [...prev, { sender: 'bot', ...step.botResponse }]);
      botText = step.botResponse.text;
    } else if (option.next_bot) {
      setMessages(prev => [...prev, { sender: 'bot', text: option.next_bot, pinyin: option.next_bot_pinyin, vi: option.next_bot_vi }]);
      botText = option.next_bot;
    }
    setTyping(false);

    // Phát âm bot rồi mới hiện options tiếp
    if (botText) await speakText(botText);

    // Check if there's a next step
    const nextId = option.nextStepId;
    if (nextId && selectedScenario.steps) {
      const nextIdx = selectedScenario.steps.findIndex(s => s.id === nextId);
      if (nextIdx >= 0) {
        setCurrentStepIdx(nextIdx);
        setShowOptions(true);
      } else {
        setCompleted(true);
      }
    } else if (stepIdx + 1 < (selectedScenario.steps?.length || 0)) {
      setCurrentStepIdx(stepIdx + 1);
      setShowOptions(true);
    } else {
      setCompleted(true);
    }
  };

  const resetChat = () => {
    setSelectedScenario(null);
    setMessages([]);
    setCompleted(false);
  };

  // Filter + search
  const filteredScenarios = scenarios.filter(sc => {
    if (diffFilter !== 'all' && sc.difficulty !== diffFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchTitle = sc.title.toLowerCase().includes(q);
      const matchDesc = (sc.description || '').toLowerCase().includes(q);
      return matchTitle || matchDesc;
    }
    return true;
  });

  // Counts per difficulty
  const diffCounts = {};
  scenarios.forEach(sc => { diffCounts[sc.difficulty] = (diffCounts[sc.difficulty] || 0) + 1; });

  // Scenario selection screen
  if (!selectedScenario) {
    if (scenarios.length === 0) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Đang tải kịch bản…</div>;

    return (
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        {/* Filter bar */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { key: 'all', label: `Tất cả (${scenarios.length})`, color: 'var(--primary)' },
              { key: 'beginner', label: `Cơ bản (${diffCounts['beginner'] || 0})`, color: 'var(--primary)' },
              { key: 'intermediate', label: `Trung cấp (${diffCounts['intermediate'] || 0})`, color: 'var(--accent-2)' },
              { key: 'advanced', label: `Nâng cao (${diffCounts['advanced'] || 0})`, color: '#f472b6' }
            ].map(({ key, label, color }) => (
              <button key={key} onClick={() => setDiffFilter(key)} style={{
                background: diffFilter === key ? color : 'rgba(255,255,255,0.03)',
                border: `1px solid ${diffFilter === key ? color : 'var(--glass-border)'}`,
                color: diffFilter === key ? '#000' : 'var(--text-muted)',
                padding: '5px 14px', borderRadius: 'var(--radius-xl)',
                cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, transition: 'var(--transition)'
              }}>
                {label}
              </button>
            ))}
          </div>
          <input type="text" placeholder="🔍 Tìm tình huống..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{
            background: 'var(--bg-surface)', border: '1px solid var(--glass-border)',
            color: 'var(--text-primary)', padding: '8px 14px', borderRadius: 'var(--radius-xl)',
            fontSize: '0.85rem', outline: 'none', minWidth: 180, fontFamily: 'Inter, sans-serif'
          }} />
        </div>

        {filteredScenarios.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            <p>Không tìm thấy tình huống phù hợp.</p>
          </div>
        ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {filteredScenarios.map(sc => (
            <div key={sc.id} className="glass-panel scenario-card" onClick={() => startScenario(sc)} style={{ padding: 20 }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>{sc.icon || '💬'}</div>
              <h3 style={{ color: 'var(--text-main)', marginBottom: 6 }}>{sc.title}</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 12, lineHeight: 1.5 }}>{sc.description}</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <span className={`tag ${sc.difficulty === 'beginner' ? 'tag-primary' : sc.difficulty === 'intermediate' ? 'tag-secondary' : 'tag-info'}`}>
                  {sc.difficulty === 'beginner' ? 'Cơ bản' : sc.difficulty === 'intermediate' ? 'Trung cấp' : 'Nâng cao'}
                </span>
                <span className="tag tag-primary">{sc.steps?.length || 1} bước</span>
              </div>
            </div>
          ))}
        </div>
        )}
      </div>
    );
  }

  // Chat interface
  const currentStep = selectedScenario.steps?.[currentStepIdx];
  const currentOptions = currentStep?.options || selectedScenario.options || [];

  return (
    <div style={{ maxWidth: 550, margin: '0 auto' }}>
      {/* Chat header */}
      <div className="glass-panel" style={{ padding: '12px 16px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button className="btn-secondary" onClick={resetChat} style={{ padding: '6px 12px', fontSize: '0.85rem' }}>
          <ChevronLeft size={16} /> Quay lại
        </button>
        <h4 style={{ color: 'var(--secondary)' }}>{selectedScenario.icon} {selectedScenario.title}</h4>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="tag tag-primary"><Target size={10} /> {score}/{totalAttempts}</span>
        </div>
      </div>

      {/* Messages */}
      <div className="glass-panel chat-container" ref={chatRef} style={{ height: 420 }}>
        {messages.map((msg, idx) => (
          <div key={idx} className={`chat-bubble-wrapper ${msg.sender} animate-fade-in`} style={{ animationDelay: `${idx * 0.05}s` }}>
            <div className={`chat-bubble ${msg.sender}`}>
              <div className="chat-pinyin">{msg.pinyin}</div>
              <div className="cn-text" style={{ fontSize: '1.15rem' }}>{msg.text}</div>
              <div className="chat-vi">{msg.vi}</div>
            </div>
          </div>
        ))}

        {typing && (
          <div className="chat-bubble-wrapper bot animate-fade-in">
            <div className="chat-bubble bot">
              <div className="typing-dots"><span /><span /><span /></div>
            </div>
          </div>
        )}

        {feedback && (
          <div className={`animate-bounce-in`} style={{ textAlign: 'center', padding: '10px 0' }}>
            <span className={feedback.type === 'correct' ? 'feedback-correct' : 'feedback-wrong'} style={{ fontSize: '0.95rem' }}>
              {feedback.text}
            </span>
          </div>
        )}

        {showOptions && !typing && !feedback && (
          <div className="chat-options animate-slide-up">
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 4 }}>Chọn câu trả lời:</p>
            {currentOptions.map((opt, idx) => (
              <button key={idx} className="chat-option-btn" onClick={() => handleSelectOption(opt, currentStepIdx)}>
                <div className="cn-text" style={{ fontSize: '1.05rem', marginBottom: 3 }}>{opt.text}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{opt.vi}</div>
              </button>
            ))}
          </div>
        )}

        {completed && (
          <div className="animate-bounce-in" style={{ textAlign: 'center', padding: '20px 0' }}>
            <Award size={48} color="var(--secondary)" style={{ marginBottom: 12 }} />
            <h3 style={{ color: 'var(--secondary)', marginBottom: 8 }}>Hoàn thành! 🎉</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: 4 }}>Điểm: {score}/{totalAttempts} ({totalAttempts > 0 ? Math.round(score / totalAttempts * 100) : 0}%)</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 16 }}>
              {score === totalAttempts ? 'Xuất sắc! Bạn trả lời đúng hết!' : score >= totalAttempts * 0.7 ? 'Khá tốt! Tiếp tục phát huy nhé!' : 'Hãy thử lại để cải thiện!'}
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="btn-primary" onClick={() => startScenario(selectedScenario)}><RotateCcw size={16} /> Chơi lại</button>
              <button className="btn-secondary" onClick={resetChat}><ArrowRight size={16} /> Kịch bản khác</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SURVIVAL GUIDE — Rich sections, phrases, copy, categories
   ═══════════════════════════════════════════════════════════════ */
function SurvivalGuide() {
  const [guides, setGuides] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [copiedText, setCopiedText] = useState(null);

  useEffect(() => {
    import('./data').then(mod => setGuides(mod.survivalGuides || []));
  }, []);

  const categories = [
    { key: 'all', label: 'Tất cả', icon: '📋' },
    { key: 'food', label: 'Ăn uống', icon: '🍜' },
    { key: 'payment', label: 'Thanh toán', icon: '💳' },
    { key: 'transport', label: 'Di chuyển', icon: '🚇' },
    { key: 'slang', label: 'Từ lóng', icon: '🗣️' },
    { key: 'culture', label: 'Văn hóa', icon: '🏮' },
    { key: 'tech', label: 'Công nghệ', icon: '📱' }
  ];

  const filtered = guides.filter(g => categoryFilter === 'all' || g.category === categoryFilter);

  const copyPhrase = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 1500);
  };

  const speakPhrase = (text) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN';
      u.rate = 0.8;
      window.speechSynthesis.speak(u);
    }
  };

  if (guides.length === 0) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Đang tải nội dung…</div>;

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      {/* Category filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
        {categories.map(cat => (
          <button key={cat.key} onClick={() => setCategoryFilter(cat.key)} style={{
            background: categoryFilter === cat.key ? 'var(--primary)' : 'var(--surface)',
            border: `1px solid ${categoryFilter === cat.key ? 'var(--primary)' : 'var(--glass-border)'}`,
            color: categoryFilter === cat.key ? '#fff' : 'var(--text-muted)',
            padding: '6px 14px', borderRadius: 'var(--radius-xl)',
            cursor: 'pointer', fontSize: '0.85rem', transition: 'var(--transition)', fontWeight: 500
          }}>
            {cat.icon} {cat.label}
          </button>
        ))}
      </div>

      {/* Guide cards */}
      {filtered.map(guide => (
        <div key={guide.id} className="glass-panel" style={{ marginBottom: 16, overflow: 'hidden', transition: 'var(--transition)' }}>
          <div onClick={() => setOpenId(openId === guide.id ? null : guide.id)} style={{
            cursor: 'pointer', padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: '1.5rem' }}>{guide.icon}</span>
              <div>
                <h3 style={{ color: 'var(--primary)', margin: 0, fontSize: '1.1rem' }}>{guide.title}</h3>
                <span className="tag tag-info" style={{ marginTop: 4 }}>{categories.find(c => c.key === guide.category)?.label}</span>
              </div>
            </div>
            <span style={{ fontSize: '1.2rem', color: 'var(--text-muted)', transition: 'var(--transition)', transform: openId === guide.id ? 'rotate(45deg)' : 'rotate(0)' }}>+</span>
          </div>

          {openId === guide.id && (
            <div className="animate-slide-up" style={{ padding: '0 20px 20px' }}>
              {guide.sections?.map((section, sIdx) => (
                <div key={sIdx} className="guide-section">
                  {section.heading && <h4 style={{ color: 'var(--secondary)', marginBottom: 10, fontSize: '1rem' }}>{section.heading}</h4>}
                  {section.content && <p style={{ lineHeight: 1.7, color: 'var(--text-main)', marginBottom: 12, fontSize: '0.95rem' }}>{section.content}</p>}
                  {section.phrases && section.phrases.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {section.phrases.map((p, pIdx) => (
                        <div key={pIdx} className="phrase-chip" onClick={() => speakPhrase(p.cn)} style={{ cursor: 'pointer', position: 'relative' }}>
                          <span className="cn">{p.cn}</span>
                          <span className="py">{p.pinyin}</span>
                          <span className="vi">{p.vi}</span>
                          <button onClick={e => { e.stopPropagation(); copyPhrase(p.cn); }} style={{
                            position: 'absolute', top: 2, right: 2, background: 'none', border: 'none',
                            color: copiedText === p.cn ? 'var(--primary)' : 'var(--text-muted)', cursor: 'pointer', padding: 2
                          }}>
                            {copiedText === p.cn ? <Check size={10} /> : <Copy size={10} />}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )) || (
                <p style={{ lineHeight: 1.7, color: 'var(--text-main)' }}>{guide.content}</p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   QUIZ SYSTEM — Original: HSK filter + random questions
   ═══════════════════════════════════════════════════════════════ */
const QUIZ_MODES = [
  { id: 'all', label: 'Tất cả', icon: '🎯' },
  { id: 'vocab', label: 'Từ vựng', icon: '📚' },
  { id: 'context', label: 'Ngữ cảnh', icon: '🧩' },
  { id: 'grammar', label: 'Ngữ pháp', icon: '📖' },
  { id: 'sentence_order', label: 'Sắp xếp câu', icon: '🔀' },
  { id: 'pick_wrong', label: 'Chọn câu sai', icon: '❌' },
];

function QuizSystem() {
  const [questions, setQuestions] = useState([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [hskFilter, setHskFilter] = useState('all');
  const [quizMode, setQuizMode] = useState('all');
  const [quizStarted, setQuizStarted] = useState(false);
  const [quizFinished, setQuizFinished] = useState(false);
  const [timer, setTimer] = useState(15);
  const [pool, setPool] = useState([]);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef(null);

  useEffect(() => {
    Promise.all([
      import('./data').then(m => m.quizQuestions || []),
      import('./quiz-generator').then(m => m.generateQuizPool(2600))
    ]).then(([staticQ, genQ]) => {
      setQuestions([...staticQ, ...genQ]);
      setLoading(false);
    });
  }, []);

  const CONTEXT_TYPES = ['context_fill', 'sentence_translate', 'pinyin_to_meaning', 'word_in_context', 'example_match'];

  const matchQuizMode = (q) => {
    if (quizMode === 'all') return true;
    if (quizMode === 'vocab') return !isGrammarQuizType(q.type) && !CONTEXT_TYPES.includes(q.type);
    if (quizMode === 'context') return CONTEXT_TYPES.includes(q.type);
    return q.type === quizMode;
  };

  const filtered = questions
    .filter(q => hskFilter === 'all' || q.hskLevel === parseInt(hskFilter))
    .filter(matchQuizMode);

  const getTimerForQuestion = (q) => {
    if (q?.type === 'sentence_order') return 30;
    if (q?.type === 'pick_wrong') return 25;
    if (q?.type === 'sentence_translate') return 20;
    if (q?.type === 'word_in_context') return 22;
    if (q?.type === 'context_fill') return 20;
    if (q?.type === 'example_match') return 18;
    if (q?.type === 'pinyin_to_meaning') return 15;
    return 15;
  };

  const getQuizSize = () => 20;

  const startQuiz = () => {
    const src = filtered;
    // 1. Deduplicate exact same questions
    const seen = new Set();
    const unique = [];
    for (const q of src) {
      const key = `${q.type}:${q.grammarKey || 'na'}:${q.question}:${q.correctSentence || q.options?.[0] || ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(q);
      }
    }
    const shuffled = [...unique].sort(() => Math.random() - 0.5);

    // 2. Limit each scenario/pattern to max 2 questions
    const scenarioCount = {};
    const getScenarioKey = (q) => {
      const text = q.question || '';
      // Extract pattern: text before first ":" or first Chinese quote "
      const colonIdx = text.indexOf(':');
      const quoteIdx = text.indexOf('"');
      const bracketEnd = text.indexOf(']');
      let base = '';
      if (bracketEnd > 0 && text.startsWith('[')) {
        // Has context prefix like [ở quán ăn], strip it
        const afterBracket = text.slice(bracketEnd + 1).trim();
        const ci = afterBracket.indexOf(':');
        const qi = afterBracket.indexOf('"');
        const cutAt = ci > 0 && qi > 0 ? Math.min(ci, qi) : ci > 0 ? ci : qi > 0 ? qi : -1;
        base = cutAt > 0 ? afterBracket.slice(0, cutAt).trim() : afterBracket.slice(0, 20);
      } else {
        const cutAt = colonIdx > 0 && quoteIdx > 0 ? Math.min(colonIdx, quoteIdx) : colonIdx > 0 ? colonIdx : quoteIdx > 0 ? quoteIdx : -1;
        base = cutAt > 0 ? text.slice(0, cutAt).trim() : text.slice(0, 20);
      }
      return `${q.type}|${q.hskLevel}|${base}`;
    };

    const picked = [];
    for (const q of shuffled) {
      if (picked.length >= getQuizSize()) break;
      const sk = getScenarioKey(q);
      const count = scenarioCount[sk] || 0;
      if (count < 2) {
        scenarioCount[sk] = count + 1;
        picked.push(q);
      }
    }

    setPool(picked);
    setQuizStarted(true);
    setCurrentQ(0);
    setScore(0);
    setQuizFinished(false);
    setSelectedIdx(null);
    setAnswered(false);
    setTimer(getTimerForQuestion(picked[0]));
  };

  useEffect(() => {
    if (quizStarted && !answered && !quizFinished) {
      timerRef.current = setInterval(() => {
        setTimer(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            setAnswered(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timerRef.current);
    }
  }, [quizStarted, answered, quizFinished, currentQ]);

  const isAnswerCorrect = (q, idx) => {
    if (!q) return false;
    if (q.type === 'sentence_order') return idx === 0;
    return idx === q.correctIndex;
  };

  const handleAnswer = (idx) => {
    if (answered) return;
    clearInterval(timerRef.current);
    setSelectedIdx(idx);
    setAnswered(true);
    if (isAnswerCorrect(pool[currentQ], idx)) setScore(p => p + 1);
  };

  const nextQuestion = () => {
    if (currentQ + 1 >= pool.length) {
      setQuizFinished(true);
      const pct = pool.length > 0 ? Math.round(score / pool.length * 100) : 0;
      try {
        const prev = JSON.parse(localStorage.getItem('quizHighScore')) || 0;
        if (pct > prev) localStorage.setItem('quizHighScore', JSON.stringify(pct));
      } catch { /* ignore */ }
    } else {
      const next = currentQ + 1;
      setCurrentQ(next);
      setSelectedIdx(null);
      setAnswered(false);
      setTimer(getTimerForQuestion(pool[next]));
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>🔮 Đang sinh câu hỏi từ 1000+ từ vựng…</div>;

  if (!quizStarted) {
    return (
      <div style={{ maxWidth: 500, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontSize: '4rem', marginBottom: 16 }}>🧠</div>
        <h2 style={{ marginBottom: 8 }}>Quiz Rèn Phản Xạ</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>
          Từ vựng · Ngữ pháp · Sắp xếp câu · Chọn câu sai
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {QUIZ_MODES.map(mode => (
            <button key={mode.id} onClick={() => setQuizMode(mode.id)} style={{
              background: quizMode === mode.id ? 'var(--accent-2)' : 'var(--bg-surface)',
              border: `1px solid ${quizMode === mode.id ? 'var(--accent-2)' : 'rgba(91,106,191,0.08)'}`,
              color: quizMode === mode.id ? '#0a0d14' : 'var(--text-muted)',
              padding: '6px 12px', borderRadius: '20px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600
            }}>
              {mode.icon} {mode.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 24, flexWrap: 'wrap' }}>
          {['all','1','2','3','4','5','6'].map(level => (
            <button key={level} onClick={() => setHskFilter(level)} style={{
              background: hskFilter === level ? 'var(--accent-1)' : 'var(--bg-surface)',
              border: `1px solid ${hskFilter === level ? 'var(--accent-1)' : 'rgba(91,106,191,0.08)'}`,
              color: hskFilter === level ? '#fff' : 'var(--text-muted)',
              padding: '5px 14px', borderRadius: '20px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600
            }}>
              {level === 'all' ? 'Tất cả' : `HSK ${level}`}
            </button>
          ))}
        </div>
        <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>
          {filtered.length} câu khả dụng · Lấy ngẫu nhiên {getQuizSize()} câu
        </p>
        <button className="btn-primary" onClick={startQuiz} disabled={filtered.length < 1} style={{ fontSize: '1.1rem', padding: '14px 32px' }}>
          <Zap size={20} /> Bắt đầu
        </button>
      </div>
    );
  }

  if (quizFinished) {
    const pct = pool.length > 0 ? Math.round(score / pool.length * 100) : 0;
    return (
      <div style={{ maxWidth: 500, margin: '0 auto', textAlign: 'center' }} className="animate-bounce-in">
        <div style={{ fontSize: '4rem', marginBottom: 12 }}>{pct >= 80 ? '🏆' : pct >= 50 ? '👏' : '💪'}</div>
        <h2 style={{ marginBottom: 8 }}>Kết quả</h2>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginBottom: 20 }}>
          <div className="stat-card"><div className="stat-value">{score}/{pool.length}</div><div className="stat-label">Đúng</div></div>
          <div className="stat-card"><div className="stat-value" style={{ color: pct >= 80 ? 'var(--accent-2)' : pct >= 50 ? 'var(--accent-3)' : '#ef4444' }}>{pct}%</div><div className="stat-label">Chính xác</div></div>
        </div>
        <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>
          {pct >= 80 ? '🌟 Xuất sắc!' : pct >= 50 ? '📖 Khá tốt!' : '📚 Ôn lại nhé!'}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button className="btn-primary" onClick={startQuiz}><RotateCcw size={16} /> Làm lại</button>
          <button className="btn-secondary" onClick={() => setQuizStarted(false)}>Quay về</button>
        </div>
      </div>
    );
  }

  const q = pool[currentQ];
  if (!q) return null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, maxWidth: 550, margin: '0 auto 16px' }}>
        <span className="tag tag-primary">Câu {currentQ + 1}/{pool.length}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: timer <= 5 ? '#ef4444' : 'var(--text-muted)' }}>
          <Clock size={16} /> <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{timer}s</span>
        </div>
        <span className="tag tag-secondary"><Target size={10} /> {score}</span>
      </div>
      <div className="progress-bar-container" style={{ marginBottom: 24, maxWidth: 550, margin: '0 auto 24px' }}>
        <div className="progress-bar-fill" style={{ width: `${((currentQ + 1) / pool.length) * 100}%` }} />
      </div>
      <QuizQuestionView
        q={q}
        answered={answered}
        selectedIdx={selectedIdx}
        timer={timer}
        onAnswer={handleAnswer}
        onNext={nextQuestion}
        currentQ={currentQ}
        poolLength={pool.length}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════════════════════════ */
function App() {
  const [activeTab, setActiveTab] = useState('flashcards');
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));

  const tabTitles = {
    flashcards: { title: '📚 Lật thẻ', sub: 'Học từ vựng qua phân tích bộ thủ và hình ảnh liên tưởng' },
    roleplay: { title: '💬 Mô Phỏng Giao Tiếp', sub: 'Luyện phản xạ giao tiếp qua các tình huống thực tế' },
    survival: { title: '🧭 Cẩm Nang Sinh Tồn', sub: 'Mẹo sống sót và từ vựng thiết yếu khi ở Trung Quốc' },
    quiz: { title: '🧠 Quiz Rèn Phản Xạ', sub: 'Từ vựng, ngữ pháp, sắp xếp câu & chọn câu sai' },
    search: { title: '🔍 Tra Từ Điển', sub: 'Tìm kiếm từ vựng nhanh theo chữ Hán, pinyin hoặc nghĩa' },
    writing: { title: '✍️ Tập Viết Chữ', sub: 'Luyện viết chữ Trung Quốc trên khung canvas' },
    dashboard: { title: '📊 Thống Kê Học Tập', sub: 'Theo dõi tiến độ, streak và thành tích của bạn' },
    grammar: { title: '📖 Bài Học Ngữ Pháp', sub: 'Cấu trúc câu, lượng từ và ngữ pháp tiếng Trung cơ bản' },
    review: { title: '✅ Đã Thuộc', sub: 'Xem lại và ôn tập các từ đã học thuộc' },
    freechat: { title: '💬 Tập Nói', sub: 'Luyện viết câu tiếng Trung theo tình huống thực tế' },
    aichat: { title: '🤖 AI Trò Chuyện', sub: 'Trò chuyện tự do với AI bằng tiếng Trung' }
  };

  return (
    <div className="app-container">
      <Header theme={theme} toggleTheme={toggleTheme} />
      <nav className="sidebar">
        <div className="sidebar-logo">🐉</div>
        <div className="sbtn-group">
          <button className={`sbtn ${activeTab === 'flashcards' ? 'active' : ''}`} onClick={() => setActiveTab('flashcards')} title="Lật thẻ"><Layers size={18} /></button>
          <button className={`sbtn ${activeTab === 'roleplay' ? 'active' : ''}`} onClick={() => setActiveTab('roleplay')} title="Hội thoại"><MessageCircle size={18} /></button>
          <button className={`sbtn ${activeTab === 'survival' ? 'active' : ''}`} onClick={() => setActiveTab('survival')} title="Cẩm nang"><BookOpen size={18} /></button>
          <button className={`sbtn ${activeTab === 'quiz' ? 'active' : ''}`} onClick={() => setActiveTab('quiz')} title="Quiz"><Brain size={18} /></button>
        </div>
        <div className="sbtn-group">
          <button className={`sbtn ${activeTab === 'search' ? 'active' : ''}`} onClick={() => setActiveTab('search')} title="Tra từ"><Search size={18} /></button>
          <button className={`sbtn ${activeTab === 'writing' ? 'active' : ''}`} onClick={() => setActiveTab('writing')} title="Tập viết"><PenTool size={18} /></button>
          <button className={`sbtn ${activeTab === 'freechat' ? 'active' : ''}`} onClick={() => setActiveTab('freechat')} title="Tập nói"><Mic size={18} /></button>
          <button className={`sbtn ${activeTab === 'aichat' ? 'active' : ''}`} onClick={() => setActiveTab('aichat')} title="AI trò chuyện"><Bot size={18} /></button>
        </div>
        <div className="sbtn-group">
          <button className={`sbtn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')} title="Thống kê"><BarChart3 size={18} /></button>
          <button className={`sbtn ${activeTab === 'grammar' ? 'active' : ''}`} onClick={() => setActiveTab('grammar')} title="Ngữ pháp"><BookMarked size={18} /></button>
          <button className={`sbtn ${activeTab === 'review' ? 'active' : ''}`} onClick={() => setActiveTab('review')} title="Đã thuộc"><CheckCircle2 size={18} /></button>
        </div>
        <div className="sidebar-theme" onClick={toggleTheme} title={theme === 'dark' ? 'Sang chế độ sáng' : 'Sang chế độ tối'}>
          {theme === 'dark' ? '☀️' : '🌙'}
        </div>
      </nav>

      <main className="main-content">
        <header className="page-header animate-fade-in">
          <h1>{tabTitles[activeTab]?.title}</h1>
          <p>{tabTitles[activeTab]?.sub}</p>
        </header>

        <div key={activeTab} className="animate-fade-slide">
          {activeTab === 'flashcards' && <FlashcardSystem />}
          {activeTab === 'roleplay' && <RoleplayChat />}
          {activeTab === 'survival' && <SurvivalGuide />}
          {activeTab === 'quiz' && <QuizSystem />}
          {activeTab === 'search' && <SearchVocab />}
          {activeTab === 'writing' && <WritingCanvas />}
          {activeTab === 'dashboard' && <Dashboard />}
          {activeTab === 'grammar' && <GrammarLessons />}
          {activeTab === 'review' && <MasteredReview />}
          {activeTab === 'freechat' && <FreeChat />}
          {activeTab === 'aichat' && <AIChat />}
        </div>
      </main>
    </div>
  );
}

export default App;