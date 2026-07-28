import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Headphones, Star, RotateCcw, Check, AlertCircle, BookOpen, AlertTriangle, ChevronLeft, ChevronRight, Lightbulb, HelpCircle } from 'lucide-react';
import { speak } from '../speech.jsx';
import { loadAllFlashcards } from '../vocab-loader.js';
import { resolveDecompositions } from '../radicals-db.js';
import HskLevelPicker from './HskLevelPicker.jsx';
import { normalizeLevels, levelMatches, levelsLabel } from '../hsk-levels.js';

// Helper to normalize pinyin to plain lowercase text without tone marks or spaces
function stripPinyin(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/ü/g, 'v')
    .replace(/[^a-z0-9]/g, '');
}

// Convert numbers in typed pinyin to compare with plain letters if needed
function cleanTypedInput(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
}

function cleanText(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function normalizeExamples(card) {
  const rows = [];
  if (Array.isArray(card.examples)) {
    card.examples.forEach(example => {
      rows.push({
        cn: cleanText(example.cn || example.sentence_cn),
        pinyin: cleanText(example.pinyin || example.py || example.examplePinyin),
        vi: cleanText(example.vi || example.meaning_vi || example.sentence_vi),
      });
    });
  }
  rows.push({
    cn: cleanText(card.exampleSentence || card.example_cn || card.sentence_cn),
    pinyin: cleanText(card.examplePinyin || card.example_pinyin),
    vi: cleanText(card.exampleVi || card.example_vi || card.sentence_vi),
  });
  const seen = new Set();
  return rows
    .filter(item => item.cn || item.vi)
    .filter(item => {
      const key = `${item.cn}|${item.vi}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizeRadicals(card) {
  const hanzi = cleanText(card.character || card.hanzi);
  const fallbackRadical = cleanText(card.radical || card.character_family);
  const resolved = resolveDecompositions(hanzi, fallbackRadical);
  
  const rows = Array.isArray(card.breakdown) ? card.breakdown : [];
  const mergedMap = new Map();
  
  resolved.forEach(item => {
    mergedMap.set(item.radical, item.meaning);
  });
  
  rows.forEach(item => {
    const rad = cleanText(item.radical || item.component || item.char);
    const mean = cleanText(item.meaning || item.hint || item.name);
    if (rad) {
      if (mean) {
        mergedMap.set(rad, mean);
      } else if (!mergedMap.has(rad)) {
        mergedMap.set(rad, '');
      }
    }
  });

  return Array.from(mergedMap.entries())
    .map(([radical, meaning]) => ({ radical, meaning }))
    .filter(item => item.radical || item.meaning);
}

function normalizeCard(card) {
  const rawLevel = Number(card.hskLevel ?? card.level);
  const level = [1, 2, 3, 4, 5, 6].includes(rawLevel) ? rawLevel : 1;
  const hanzi = cleanText(card.character || card.hanzi);
  const pinyin = cleanText(card.pinyin);
  const meaningVi = cleanText(card.meaning_vi || card.meaning);
  const examples = normalizeExamples(card);
  const radicals = normalizeRadicals(card);
  const sourceQuality = (Array.isArray(card.examples) && card.examples.length ? 3 : 0) + (examples.length ? 2 : 0) + (radicals.length ? 2 : 0) + (card.mnemonic ? 1 : 0);
  return {
    key: `${level}-${hanzi}-${pinyin || 'no-pinyin'}`,
    id: card.id || `${level}-${hanzi}`,
    hanzi,
    pinyin,
    meaning_vi: meaningVi,
    level,
    category: cleanText(card.category) || 'core',
    stroke_count: Number(card.strokeCount || card.stroke_count || 0),
    radicals,
    mnemonic: cleanText(card.mnemonic || card.component_hint),
    examples,
    example_cn: examples[0]?.cn || '',
    example_pinyin: examples[0]?.pinyin || '',
    example_vi: examples[0]?.vi || '',
    source_quality: sourceQuality,
  };
}

export default function VocabTypingMode({ focusLevels }) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  // levelFilter = MẢNG số đã chọn. Rỗng => tất cả (levelMatches xử lý).
  const [levelFilter, setLevelFilter] = useState(() => normalizeLevels(focusLevels));
  const [limit, setLimit] = useState(10);
  const [sessionCards, setSessionCards] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [inputValue, setInputValue] = useState('');
  const [showAnswer, setShowAnswer] = useState(false);
  const [starredKeys, setStarredKeys] = useState(() => {
    try {
      return JSON.parse(window.localStorage.getItem('starredVocabKeys')) || [];
    } catch {
      return [];
    }
  });
  const [sessionCompleted, setSessionCompleted] = useState(false);
  const [score, setScore] = useState(0);
  
  const inputRef = useRef(null);

  // Initialize/Restart session.
  //
  // Nhận nguồn thẻ + bộ lọc qua tham số (mặc định là state hiện tại) để gọi
  // được NGAY trong handler đổi cấp/số từ và trong callback tải xong dữ liệu —
  // lúc đó state mới chưa kịp commit nên không đọc được từ closure.
  const startSession = useCallback((sourceCards = cards, levels = levelFilter, count = limit) => {
    const filtered = sourceCards.filter(c => levelMatches(levels, c.level));
    // Shuffle filtered list
    const shuffled = [...filtered].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, count);
    setSessionCards(selected);
    setCurrentIndex(0);
    setInputValue('');
    setShowAnswer(false);
    setSessionCompleted(false);
    setScore(0);
    setTimeout(() => {
      if (inputRef.current) inputRef.current.focus();
    }, 100);
  }, [cards, levelFilter, limit]);

  // Nạp toàn bộ flashcard một lần khi mount.
  //
  // Đặt SAU ``startSession`` vì effect gọi hàm này; khai báo ``const`` ở trên sẽ
  // vào vùng chưa khởi tạo (TDZ) nếu đảo thứ tự.
  useEffect(() => {
    let alive = true;
    loadAllFlashcards().then(rawCards => {
      if (!alive) return;
      const normalized = rawCards.map(normalizeCard).filter(c => c.hanzi && c.pinyin && c.meaning_vi);
      // Deduplicate
      const uniqueMap = new Map();
      normalized.forEach(c => {
        const key = `${c.level}-${c.hanzi}`;
        if (!uniqueMap.has(key) || c.source_quality > uniqueMap.get(key).source_quality) {
          uniqueMap.set(key, c);
        }
      });
      const loaded = Array.from(uniqueMap.values());
      setCards(loaded);
      setLoading(false);
      // Mở phiên đầu tiên ngay tại đây thay vì qua useEffect: truyền thẳng
      // ``loaded`` vì state ``cards`` chưa commit ở thời điểm này.
      startSession(loaded);
    }).catch(err => {
      console.error('Error loading cards in typing mode:', err);
      setLoading(false);
    });
    return () => { alive = false; };
    // Chỉ chạy một lần lúc mount: cố tình bỏ ``startSession`` khỏi deps để việc
    // đổi cấp/số từ không kích hoạt tải lại dữ liệu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentCard = sessionCards[currentIndex];

  // Auto focus input when switching cards
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [currentIndex, sessionCards]);

  // Star / Favorite toggle
  const toggleStar = (card) => {
    if (!card) return;
    const key = card.key;
    let nextKeys;
    if (starredKeys.includes(key)) {
      nextKeys = starredKeys.filter(k => k !== key);
    } else {
      nextKeys = [...starredKeys, key];
    }
    setStarredKeys(nextKeys);
    window.localStorage.setItem('starredVocabKeys', JSON.stringify(nextKeys));
  };

  // TTS audio playback
  const playAudio = () => {
    if (currentCard) {
      speak(currentCard.hanzi, 0.85);
    }
  };

  // Handle typing input
  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputValue(val);
  };

  // Determine whether input matches target (can be Hanzi or Pinyin)
  const checkAnswerMatch = (input, card) => {
    if (!card) return false;
    const cleanInput = cleanTypedInput(input);
    const cleanHanzi = cleanTypedInput(card.hanzi);
    const cleanPinyinStr = stripPinyin(card.pinyin);

    // Matches directly by Chinese characters
    if (cleanInput === cleanHanzi) return true;
    
    // Matches by Pinyin (without tones and special chars)
    if (cleanInput === cleanPinyinStr) return true;

    // Check with numbers: e.g. "qian2bao1" matches "qianbao" or "qiánbāo"
    const inputWithoutNumbers = cleanInput.replace(/[1-5]/g, '');
    if (inputWithoutNumbers === cleanPinyinStr) return true;

    return false;
  };

  // Submit Answer
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      submitAnswer();
    }
  };

  const submitAnswer = () => {
    if (!currentCard) return;
    const isCorrect = checkAnswerMatch(inputValue, currentCard);
    
    if (isCorrect) {
      setScore(prev => prev + 1);
    }
    
    setShowAnswer(true);
    playAudio();
  };

  const handleNext = () => {
    if (currentIndex + 1 < sessionCards.length) {
      setCurrentIndex(prev => prev + 1);
      setInputValue('');
      setShowAnswer(false);
    } else {
      setSessionCompleted(true);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setInputValue('');
      setShowAnswer(false);
    }
  };

  // Build live character-by-character coloring
  const characterAlignment = useMemo(() => {
    if (!currentCard || !inputValue) return null;
    
    const isChineseInput = /[\u4e00-\u9fa5]/.test(inputValue);
    const target = isChineseInput ? currentCard.hanzi : stripPinyin(currentCard.pinyin);
    const typed = isChineseInput ? cleanTypedInput(inputValue) : cleanTypedInput(inputValue).replace(/[1-5]/g, '');
    
    const elements = [];
    const maxLength = Math.max(target.length, typed.length);
    
    for (let i = 0; i < maxLength; i++) {
      const targetChar = target[i] || '';
      const typedChar = typed[i] || '';
      
      let status = 'pending'; // correct, wrong, pending
      if (typedChar) {
        status = typedChar === targetChar ? 'correct' : 'wrong';
      }
      
      elements.push({
        targetChar,
        typedChar,
        status
      });
    }
    
    return {
      isChineseInput,
      elements,
      target
    };
  }, [inputValue, currentCard]);

  if (loading) {
    return (
      <div className="core-page page-enter tab-loading">
        <div className="spinner-wrapper">
          <BookOpen className="spin" size={32} />
          <p>Đang tải dữ liệu luyện gõ...</p>
        </div>
      </div>
    );
  }

  if (sessionCompleted) {
    const accuracy = sessionCards.length ? Math.round((score / sessionCards.length) * 100) : 0;
    return (
      <main className="core-page page-enter">
        <section className="qz core-card result-card general-result-card glass-panel">
          <span className="core-eyebrow">Kết quả luyện tập</span>
          <h1>{accuracy >= 80 ? 'Xuất sắc!' : accuracy >= 50 ? 'Khá tốt!' : 'Cần cố gắng thêm'}</h1>
          <p>Bạn đã hoàn thành phiên luyện gõ từ vựng.</p>
          
          <div className="result-summary">
            <strong className="accuracy-percentage">{accuracy}%</strong>
            <span>Đúng {score} / {sessionCards.length} từ</span>
          </div>

          <div className="result-actions">
            <button className="btn-primary" onClick={() => startSession()}>
              <RotateCcw size={16} /> Luyện lại phiên mới
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="core-page page-enter">
      {/* Session Controls */}
      <section className="core-card core-section-head vocab-head glass-panel">
        <div>
          <span className="core-eyebrow">Luyện gõ từ vựng</span>
          <h1>Luyện phản xạ từ vựng</h1>
          <p>Nhìn nghĩa tiếng Việt, gõ pinyin (ví dụ `qian2bao1`) hoặc chữ Hán tương ứng.</p>
        </div>
        <div className="vocab-controls">
          <div className="control-row">
            <div className="select-label typing-level-label">
              <span>Cấp độ: <em className="typing-level-current">{levelsLabel(levelFilter)}</em></span>
              <HskLevelPicker
                value={levelFilter}
                onChange={next => { setLevelFilter(next); setSessionCards([]); }}
                variant="chip"
                showAll
                allowEmpty
                className="vocab-hsk-tabs"
                buttonClassName=""
                ariaLabel="Chọn cấp HSK để luyện gõ"
              />
            </div>
            <label className="select-label">
              <span>Số từ:</span>
              <select value={limit} onChange={e => { setLimit(Number(e.target.value)); setSessionCards([]); }}>
                <option value="5">5 từ</option>
                <option value="10">10 từ</option>
                <option value="20">20 từ</option>
                <option value="30">30 từ</option>
              </select>
            </label>
            <button className="btn-secondary btn-restart" onClick={() => startSession()}>
              <RotateCcw size={15} /> Trộn lại
            </button>
          </div>
        </div>
      </section>

      {currentCard ? (
        <section className="typing-workspace">
          {/* Main Challenge Card */}
          <div className="qz core-card typing-card glass-panel">
            {/* Top progress indicator */}
            <div className="question-topline">
              <span className="hsk-badge">HSK {currentCard.level}</span>
              <span className="card-progress">{currentIndex + 1} / {sessionCards.length}</span>
            </div>

            <div className="progress-bar-container">
              <div 
                className="progress-bar-fill" 
                style={{ width: `${((currentIndex + 1) / sessionCards.length) * 100}%` }} 
              />
            </div>

            {/* Vietnamese Meaning Prompt */}
            <div className="prompt-container">
              <span className="eyebrow-label">Nghĩa tiếng Việt</span>
              <h2 className="meaning-prompt">{currentCard.meaning_vi}</h2>
              {currentCard.category && (
                <span className="pos-badge">{currentCard.category.toUpperCase()}</span>
              )}
            </div>

            {/* Live Character Highlight Box */}
            {characterAlignment && (
              <div className="alignment-display" aria-label="Đang so khớp từng chữ">
                {characterAlignment.elements.map((el, i) => (
                  <span 
                    key={i} 
                    className={`align-char align-${el.status}`}
                  >
                    {el.status === 'wrong' ? el.typedChar : el.targetChar || el.typedChar}
                  </span>
                ))}
              </div>
            )}

            {/* Input Box */}
            <div className="input-row">
              <input
                ref={inputRef}
                type="text"
                className={`typing-input ${showAnswer ? (checkAnswerMatch(inputValue, currentCard) ? 'input-correct' : 'input-incorrect') : ''}`}
                value={inputValue}
                onChange={handleInputChange}
                onKeyPress={handleKeyPress}
                placeholder="Gõ pinyin hoặc chữ Hán tại đây..."
                disabled={showAnswer}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
              />
              {!showAnswer && (
                <button 
                  className="btn-primary btn-submit-ans" 
                  onClick={submitAnswer}
                  disabled={!inputValue.trim()}
                >
                  Kiểm tra
                </button>
              )}
            </div>

            {/* Control buttons inside the card */}
            <div className="typing-card-actions">
              <button 
                className="btn-secondary action-btn" 
                onClick={handlePrev}
                disabled={currentIndex === 0}
                title="Quay lại từ trước"
              >
                <ChevronLeft size={16} /> Trước
              </button>

              <button 
                className="btn-secondary action-btn" 
                onClick={playAudio}
                title="Nghe phát âm"
              >
                <Headphones size={16} /> Nghe
              </button>

              <button 
                className={`btn-secondary action-btn ${starredKeys.includes(currentCard.key) ? 'starred-active' : ''}`} 
                onClick={() => toggleStar(currentCard)}
                title="Lưu từ yêu thích"
              >
                <Star size={16} fill={starredKeys.includes(currentCard.key) ? '#ffb020' : 'none'} stroke={starredKeys.includes(currentCard.key) ? '#ffb020' : 'currentColor'} />
                {starredKeys.includes(currentCard.key) ? ' Đã lưu' : ' Lưu'}
              </button>

              <button 
                className="btn-secondary action-btn" 
                onClick={() => setShowAnswer(prev => !prev)}
                title="Xem đáp án và bộ thủ"
              >
                <HelpCircle size={16} /> Đáp án
              </button>

              <button 
                className="btn-primary action-btn next-btn" 
                onClick={showAnswer ? handleNext : submitAnswer}
              >
                {showAnswer ? <>Tiếp <ChevronRight size={16} /></> : 'Kiểm tra'}
              </button>
            </div>

            {/* Detailed Answer Panel (including Radicals & Mnemonics) */}
            {showAnswer && (
              <div className="detailed-answer-panel slide-up">
                <div className="answer-header">
                  <div className="accuracy-stamp">
                    {checkAnswerMatch(inputValue, currentCard) ? (
                      <span className="stamp-correct"><Check size={16} /> Đúng</span>
                    ) : (
                      <span className="stamp-incorrect"><AlertTriangle size={16} /> Sai</span>
                    )}
                  </div>
                  <div className="correct-word-display">
                    <h3 className="correct-hanzi">{currentCard.hanzi}</h3>
                    <span className="correct-pinyin">{currentCard.pinyin}</span>
                  </div>
                </div>

                {/* Radicals & Component Breakdown */}
                <div className="answer-section">
                  <h4 className="section-title">Bộ thủ & Thành phần chữ Hán:</h4>
                  <div className="radicals-container">
                    {currentCard.radicals && currentCard.radicals.length > 0 ? (
                      currentCard.radicals.map((r, i) => (
                        <div key={i} className="radical-item-badge">
                          <span className="radical-char">{r.radical}</span>
                          <span className="radical-mean">{r.meaning}</span>
                        </div>
                      ))
                    ) : (
                      <span className="no-data-text">Đang phân tích các nét bộ thủ...</span>
                    )}
                  </div>
                </div>

                {/* Mnemonic / Mẹo nhớ */}
                {currentCard.mnemonic && (
                  <div className="answer-section mnemonic-section">
                    <h4 className="section-title">Mẹo nhớ chữ Hán:</h4>
                    <p className="mnemonic-text">💡 {currentCard.mnemonic}</p>
                  </div>
                )}

                {/* Example sentence */}
                {currentCard.example_cn && (
                  <div className="answer-section example-section">
                    <h4 className="section-title">Ví dụ áp dụng:</h4>
                    <div className="example-item">
                      <p className="example-cn">{currentCard.example_cn}</p>
                      <p className="example-py">{currentCard.example_pinyin}</p>
                      <p className="example-vi">{currentCard.example_vi}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      ) : (
        <div className="core-card empty-state glass-panel">
          <AlertCircle size={28} />
          <h2>Không tìm thấy từ vựng nào</h2>
          <p>Không có từ vựng phù hợp với bộ lọc {levelsLabel(levelFilter)}. Hãy thử chọn cấp độ khác.</p>
        </div>
      )}
    </main>
  );
}
