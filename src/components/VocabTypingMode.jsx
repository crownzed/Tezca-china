import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Headphones, Star, RotateCcw, Check, AlertCircle, BookOpen, AlertTriangle, ChevronLeft, ChevronRight, HelpCircle, Lightbulb } from 'lucide-react';
import { speak } from '../speech.jsx';
import { loadAllFlashcards } from '../vocab-loader.js';
import { resolveDecompositions } from '../radicals-db.js';
import { captureWordReview } from '../srs-capture.js';
import { isStarred, setStarred, toggleStarred } from '../vocab-srs.js';
import HskLevelPicker from './HskLevelPicker.jsx';
import { normalizeLevels, levelMatches, levelsLabel } from '../hsk-levels.js';

// Kho ★ cũ của riêng màn này: khoá theo `${level}-${hanzi}-${pinyin}` và KHÔNG
// namespace theo user, nên hai tài khoản trên cùng máy dùng lẫn ghim của nhau.
// Giờ ghim nằm chung record SRS (vocab-srs.setStarred, đã scope theo user); key
// này chỉ còn để chuyển dữ liệu cũ sang một lần rồi xoá.
const LEGACY_STAR_KEY = 'starredVocabKeys';

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
    // Shape mà vocab-srs/srs-capture đọc. word_id dùng CHUNG với luồng quiz
    // (card.id = 'db-<id>' từ vocab-loader) nên gõ đúng một từ ở đây và trả lời
    // đúng từ đó trong quiz cùng cộng vào MỘT lịch ôn.
    srsWord: {
      word_id: card.id || `${level}-${hanzi}`,
      hanzi,
      pinyin,
      meaning_vi: meaningVi,
      level,
    },
  };
}

// Chuyển kho ★ cũ (không scope theo user) sang record SRS một lần. Chạy sau khi
// thẻ đã nạp vì setStarred cần hanzi/pinyin/level để lưu kèm record.
function migrateLegacyStars(cards) {
  let legacy;
  try {
    legacy = JSON.parse(window.localStorage.getItem(LEGACY_STAR_KEY));
  } catch {
    legacy = null;
  }
  if (!Array.isArray(legacy) || !legacy.length) return;
  const byKey = new Map(cards.map(card => [card.key, card]));
  legacy.forEach(key => {
    const card = byKey.get(key);
    if (card) setStarred(card.srsWord, true);
  });
  try {
    window.localStorage.removeItem(LEGACY_STAR_KEY);
  } catch {
    /* bị chặn thì lần sau chuyển lại — setStarred idempotent nên không sao */
  }
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
  // Ghim đọc từ kho SRS (đã scope theo user). starDirty buộc đọc lại localStorage
  // sau khi bật/tắt — cùng cách FlashcardMode làm.
  const [starDirty, setStarDirty] = useState(0);
  const [sessionCompleted, setSessionCompleted] = useState(false);
  const [score, setScore] = useState(0);

  const inputRef = useRef(null);
  // Mốc lúc thẻ hiện ra → độ trễ thật cho auto-confidence. Không đo thì mọi câu
  // đúng đều nhận cùng quality và lịch ôn mất độ phân giải.
  const shownAtRef = useRef(0);
  // Chặn ghi SRS hai lần cho cùng một thẻ: submitAnswer gọi được từ nút, Enter và
  // listener toàn cục; ngoài ra người học bấm "Đáp án" rồi bấm "Kiểm tra" vẫn ở
  // trên cùng thẻ đó.
  const capturedRef = useRef(new Set());

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
    capturedRef.current = new Set();
    shownAtRef.current = Date.now();
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
      // Chuyển kho ★ cũ sang record SRS trước khi màn hiển thị: nếu không, người
      // đã ghim từ ở bản trước sẽ thấy tất cả biến mất.
      migrateLegacyStars(loaded);
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

  // Star / Favorite toggle — ghi vào record SRS của từ, không phải store riêng.
  const toggleStar = (card) => {
    if (!card) return;
    toggleStarred(card.srsWord);
    setStarDirty(value => value + 1);
  };

  const currentStarred = useMemo(
    () => (currentCard ? isStarred(currentCard.srsWord) : false),
    // starDirty buộc đọc lại localStorage sau khi bật/tắt ★.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentCard, starDirty],
  );

  // TTS audio playback
  // TTS audio playback
  const playAudio = useCallback(() => {
    if (currentCard?.hanzi) {
      speak(currentCard.hanzi, 0.85);
    }
  }, [currentCard]);

  // Handle typing input
  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputValue(val);
  };

  // Determine whether input matches target (can be Hanzi or Pinyin)
  const checkAnswerMatch = useCallback((input, card) => {
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
  }, []);

  const submitAnswer = useCallback(() => {
    if (!currentCard) return;
    const isCorrect = checkAnswerMatch(inputValue, currentCard);

    if (isCorrect) {
      setScore(prev => prev + 1);
    }

    // Ghi lịch ôn ngay tại lượt trả lời, không dồn về cuối phiên: thoát giữa phiên
    // vẫn giữ được tiến độ. Gõ lại từ là GỢI LẠI CHỦ ĐỘNG (không có 4 lựa chọn để
    // loại trừ) nên đây là tín hiệu mạnh hơn quiz — activity 'typing' để
    // auto-confidence dùng ngân sách thời gian rộng hơn, có tính cả chi phí gõ.
    if (!capturedRef.current.has(currentCard.key)) {
      capturedRef.current.add(currentCard.key);
      captureWordReview({
        word: currentCard.srsWord,
        correct: isCorrect,
        latencyMs: shownAtRef.current ? Date.now() - shownAtRef.current : null,
        activity: 'typing',
      });
    }

    setShowAnswer(true);
    playAudio();
  }, [currentCard, inputValue, checkAnswerMatch, playAudio]);

  const handleNext = useCallback(() => {
    if (currentIndex + 1 < sessionCards.length) {
      setCurrentIndex(prev => prev + 1);
      setInputValue('');
      setShowAnswer(false);
      shownAtRef.current = Date.now();
      setTimeout(() => {
        if (inputRef.current) inputRef.current.focus();
      }, 50);
    } else {
      setSessionCompleted(true);
    }
  }, [currentIndex, sessionCards.length]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setInputValue('');
      setShowAnswer(false);
      shownAtRef.current = Date.now();
      setTimeout(() => {
        if (inputRef.current) inputRef.current.focus();
      }, 50);
    }
  }, [currentIndex]);

  // "Xem đáp án" trước khi nộp = KHÔNG gợi lại được. Ghi luôn một lượt sai cho từ
  // đó rồi chốt (capturedRef) để cú "Kiểm tra" sau khi đã đọc đáp án không ghi đè
  // thành đúng — nếu không, nhìn đáp án rồi gõ lại là cách vô tình giãn lịch ôn
  // của đúng những từ chưa nhớ.
  const revealAnswer = useCallback(() => {
    if (showAnswer) {
      setShowAnswer(false);
      return;
    }
    if (currentCard && !capturedRef.current.has(currentCard.key)) {
      capturedRef.current.add(currentCard.key);
      captureWordReview({
        word: currentCard.srsWord,
        correct: false,
        latencyMs: shownAtRef.current ? Date.now() - shownAtRef.current : null,
        activity: 'typing',
      });
    }
    setShowAnswer(true);
  }, [currentCard, showAnswer]);

  // Xử lý phím Enter / Space trong ô nhập liệu
  const handleInputKeyDown = (e) => {
    // Không can thiệp khi bộ gõ tiếng Trung (IME) đang chọn chữ
    if (e.nativeEvent?.isComposing || e.isComposing) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      if (showAnswer) {
        handleNext();
      } else {
        submitAnswer();
      }
      return;
    }

    if (e.key === ' ' || e.code === 'Space') {
      if (showAnswer) {
        e.preventDefault();
        handleNext();
        return;
      }
      // Nếu đã gõ đúng từ, phím Space lập tức xác nhận kiểm tra
      if (checkAnswerMatch(inputValue, currentCard)) {
        e.preventDefault();
        submitAnswer();
        return;
      }
    }
  };

  // Lắng nghe phím Space / Enter toàn cục để chuyển từ nhanh
  useEffect(() => {
    const onGlobalKeyDown = (e) => {
      if (sessionCompleted || !currentCard) return;
      if (e.nativeEvent?.isComposing || e.isComposing) return;

      const activeEl = document.activeElement;
      const isOurInput = activeEl === inputRef.current;
      const isOtherInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable) && !isOurInput;
      if (isOtherInput) return;

      // Khi đã hiện đáp án: Space, Enter hoặc Mũi tên phải sẽ chuyển sang từ tiếp theo
      if (showAnswer) {
        if (e.key === 'Enter' || e.code === 'Space' || e.key === ' ' || e.key === 'ArrowRight') {
          e.preventDefault();
          handleNext();
          return;
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          handlePrev();
          return;
        }
      } else if (!isOurInput) {
        // Khi focus nằm ngoài ô input
        if (e.key === 'Enter') {
          e.preventDefault();
          submitAnswer();
        } else if ((e.code === 'Space' || e.key === ' ') && checkAnswerMatch(inputValue, currentCard)) {
          e.preventDefault();
          submitAnswer();
        }
      }
    };

    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, [showAnswer, sessionCompleted, currentCard, inputValue, handleNext, handlePrev, submitAnswer, checkAnswerMatch]);

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
                onKeyDown={handleInputKeyDown}
                placeholder={showAnswer ? "Nhấn phím Cách (Space) hoặc Enter để sang từ tiếp theo..." : "Gõ pinyin hoặc chữ Hán tại đây..."}
                readOnly={showAnswer}
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
                  title="Nhấn Enter để kiểm tra"
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
                title="Quay lại từ trước (Mũi tên trái)"
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
                className={`btn-secondary action-btn ${currentStarred ? 'starred-active' : ''}`}
                onClick={() => toggleStar(currentCard)}
                title="Lưu từ yêu thích"
                aria-pressed={currentStarred}
              >
                <Star size={16} fill={currentStarred ? '#ffb020' : 'none'} stroke={currentStarred ? '#ffb020' : 'currentColor'} />
                {currentStarred ? ' Đã lưu' : ' Lưu'}
              </button>

              <button
                className="btn-secondary action-btn"
                onClick={revealAnswer}
                title="Xem đáp án và bộ thủ"
              >
                <HelpCircle size={16} /> Đáp án
              </button>

              <button 
                className="btn-primary action-btn next-btn" 
                onClick={showAnswer ? handleNext : submitAnswer}
                title={showAnswer ? "Chuyển sang từ tiếp theo (Space hoặc Enter)" : "Kiểm tra đáp án (Enter)"}
              >
                {showAnswer ? <>Tiếp (Space / Enter) <ChevronRight size={16} /></> : 'Kiểm tra (Enter)'}
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
                    <p className="mnemonic-text"><Lightbulb size={16} /> {currentCard.mnemonic}</p>
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
