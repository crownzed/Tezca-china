// ============================================================
// FLASHCARD MODE — Ôn nhanh bằng thẻ, nối thẳng vào kho SRS per-word.
//
// TRƯỚC ĐÂY: lật thẻ rồi TỰ ĐÁNH GIÁ "Quên / Chưa chắc / Đã biết". Thang đó là
// đầu vào SM-2, nhưng nó là lời KHAI của người học, không phải phép đo: ai cũng
// bấm "Đã biết" cho từ vừa đọc đáp án xong, và lịch ôn bị giãn theo lời khai đó.
//
// GIỜ: mặt trước hỏi, người học CHỌN một trong 3 đáp án. Cú chọn cho đúng/sai
// thật + độ trễ thật, hai thứ đó đi qua auto-confidence.js để suy mức chắc — cùng
// đường với quiz và mọi màn khác. Một cú bấm thay cho hai (lật + chấm), và không
// còn chỗ nào hỏi người học "bạn thấy mình nhớ đến đâu".
//
// Nhiễu (đáp án sai) lấy từ chính các thẻ cùng dải cấp đang lọc, KHÔNG lấy theo
// bộ lọc "đến hạn ôn" — nhiễu chỉ cần sai, không cần đến hạn.
//
// Dùng CHUNG word_id với luồng quiz (card.id = 'db-<id>' từ vocab-loader) nên một
// từ chỉ có MỘT lịch ôn, ôn bằng thẻ hay bằng quiz đều cộng dồn vào đó.
// ============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, ChevronLeft, ChevronRight, Lightbulb, RotateCcw, Shuffle, Star, Volume2, X } from 'lucide-react';
import { speak } from '../speech.jsx';
import { loadAllFlashcards } from '../vocab-loader.js';
import { getDueWords, isStarred, toggleStarred, wordKeyOf } from '../vocab-srs.js';
import { captureWordReview } from '../srs-capture.js';
import HskLevelPicker from './HskLevelPicker.jsx';
import { levelMatches, levelsLabel, normalizeLevels } from '../hsk-levels.js';

const DECK_SIZES = [10, 20, 30, 50];

// 3 lựa chọn: đủ để loại trừ không còn là chiến thuật thắng (33% đoán bừa) mà vẫn
// đọc hết được trong một nhịp mắt, giữ đúng tinh thần "ôn nhanh" của thẻ.
const CHOICE_COUNT = 3;

// Ba mức tổng kết, suy TỪ dữ liệu đã ghi (không phải từ lời khai). Dùng lại đúng
// class màu của bản cũ: jade / gold / cinnabar.
const RECAP_BUCKETS = [
  { id: 'solid', label: 'Nhớ ngay', className: 'grade-known' },
  { id: 'slow', label: 'Nhớ được', className: 'grade-unsure' },
  { id: 'miss', label: 'Chưa nhớ', className: 'grade-forgot' },
];

function cleanText(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

// Chuẩn hoá thẻ từ vocab-loader về shape phẳng cho màn này. Giữ `srsWord` riêng
// để truyền nguyên vào srs-capture/toggleStarred — các hàm đó đọc word_id, hanzi,
// pinyin, meaning_vi, level.
function normalizeCard(card) {
  const level = Number(card.hskLevel ?? card.level) || 1;
  const hanzi = cleanText(card.character || card.hanzi);
  const pinyin = cleanText(card.pinyin);
  const meaning = cleanText(card.meaning_vi || card.meaning);
  const examples = (Array.isArray(card.examples) ? card.examples : [])
    .map(row => ({ cn: cleanText(row.cn), vi: cleanText(row.vi) }))
    .filter(row => row.cn);
  const fallbackExample = {
    cn: cleanText(card.exampleSentence),
    vi: cleanText(card.exampleVi),
  };
  return {
    key: `${level}-${hanzi}`,
    hanzi,
    pinyin,
    meaning,
    level,
    category: cleanText(card.category) || 'core',
    mnemonic: cleanText(card.mnemonic),
    example: examples[0] || (fallbackExample.cn ? fallbackExample : null),
    srsWord: {
      word_id: card.id,
      hanzi,
      pinyin,
      meaning_vi: meaning,
      level,
    },
  };
}

function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Dựng bộ lựa chọn cho một thẻ. `field` là mặt SAU của thẻ (thứ cần gợi lại).
// Nhiễu lọc trùng theo chính chuỗi hiển thị: hai từ khác nhau vẫn có thể dịch ra
// cùng một nghĩa tiếng Việt, để lọt thì câu hỏi có hai đáp án đúng.
function buildChoices(card, distractorPool, field) {
  const answer = card[field];
  if (!answer) return null;
  const seen = new Set([answer]);
  const wrong = [];
  for (const other of shuffle(distractorPool)) {
    if (wrong.length >= CHOICE_COUNT - 1) break;
    const value = other[field];
    if (!value || seen.has(value)) continue;
    seen.add(value);
    wrong.push(value);
  }
  // Không đủ nhiễu (kho quá nhỏ ở cấp đang lọc) thì thôi không hỏi — trả null để
  // caller hiện thẻ ở dạng chỉ xem, thay vì hỏi một câu chỉ có một đáp án.
  if (!wrong.length) return null;
  return { answer, options: shuffle([answer, ...wrong]) };
}

export default function FlashcardMode({ focusLevels }) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [levelFilter, setLevelFilter] = useState(() => normalizeLevels(focusLevels));
  const [deckSize, setDeckSize] = useState(20);
  // 'hanzi' = mặt trước chữ Hán, chọn nghĩa (nhận diện). 'meaning' = mặt trước
  // nghĩa Việt, chọn chữ Hán (chủ động gợi lại — khó hơn, gần lúc cần nói/viết).
  const [front, setFront] = useState('hanzi');
  const [dueOnly, setDueOnly] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);

  const [deck, setDeck] = useState([]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState(null);
  const [graded, setGraded] = useState({});
  const [finished, setFinished] = useState(false);
  const [starDirty, setStarDirty] = useState(0);

  // Mốc thời gian lúc thẻ hiện ra → độ trễ thật cho auto-confidence. Không đo thì
  // mọi câu đúng đều nhận cùng mức chắc và lịch ôn mất độ phân giải. Khởi tạo 0
  // (không gọi Date.now() trong lúc render); startDeck/goTo đặt mốc thật.
  const shownAtRef = useRef(0);

  useEffect(() => {
    let alive = true;
    loadAllFlashcards()
      .then(raw => {
        if (!alive) return;
        const normalized = raw.map(normalizeCard).filter(card => card.hanzi && card.meaning);
        const unique = new Map();
        normalized.forEach(card => { if (!unique.has(card.key)) unique.set(card.key, card); });
        setCards([...unique.values()]);
        setLoading(false);
      })
      .catch(err => {
        console.error('Flashcard load error:', err);
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, []);

  // Thẻ trong dải cấp đang lọc — nguồn NHIỄU cho các lựa chọn sai.
  const byLevel = useMemo(
    () => cards.filter(card => levelMatches(levelFilter, card.level)),
    [cards, levelFilter],
  );

  const pool = useMemo(() => {
    if (!dueOnly) return byLevel;
    // Chỉ ôn từ ĐẾN HẠN: lấy khoá từ kho SRS rồi giao với pool đang lọc. So khớp
    // bằng wordKeyOf để dùng đúng key space với luồng quiz (word_id, không phải hanzi).
    const dueKeys = new Set(getDueWords(200).map(record => wordKeyOf(record)).filter(Boolean));
    return byLevel.filter(card => dueKeys.has(wordKeyOf(card.srsWord)));
  }, [byLevel, dueOnly]);

  const startDeck = useCallback(() => {
    setDeck(shuffle(pool).slice(0, deckSize));
    setIndex(0);
    setPicked(null);
    setGraded({});
    setFinished(false);
    shownAtRef.current = Date.now();
  }, [pool, deckSize]);

  // Dựng bộ thẻ đầu tiên khi pool sẵn sàng, và dựng lại mỗi khi đổi bộ lọc
  // (deck rỗng = tín hiệu cần dựng lại, giống VocabTypingMode).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- pool đến từ fetch bất đồng bộ nên bộ thẻ chỉ dựng được sau khi có dữ liệu
    if (!loading && pool.length && deck.length === 0 && !finished) startDeck();
  }, [loading, pool, deck.length, finished, startDeck]);

  const current = deck[index];
  const answerField = front === 'hanzi' ? 'meaning' : 'hanzi';

  // Lựa chọn chốt theo (thẻ, chiều hỏi): không tính lại mỗi render, nếu không thứ
  // tự đáp án đảo ngay dưới ngón tay người học.
  const quiz = useMemo(
    () => (current ? buildChoices(current, byLevel.filter(card => card.key !== current.key), answerField) : null),
    [current, byLevel, answerField],
  );

  const speakCurrent = useCallback(() => {
    if (current?.hanzi) speak(current.hanzi, 0.8);
  }, [current]);

  const goTo = useCallback((nextIndex) => {
    setIndex(nextIndex);
    setPicked(null);
    shownAtRef.current = Date.now();
  }, []);

  const advance = useCallback(() => {
    if (index + 1 < deck.length) goTo(index + 1);
    else setFinished(true);
  }, [deck.length, goTo, index]);

  // Chọn đáp án: ghi SRS NGAY tại đây (không dồn về cuối phiên) để thoát giữa
  // phiên vẫn giữ được tiến độ đã ôn. Không tự sang thẻ sau — mặt sau hiện ra làm
  // phản hồi, người học đọc pinyin/ví dụ rồi tự bấm tiếp.
  const choose = useCallback((option) => {
    if (!current || !quiz || picked) return;
    const correct = option === quiz.answer;
    setPicked(option);

    const record = captureWordReview({
      word: current.srsWord,
      correct,
      latencyMs: shownAtRef.current ? Date.now() - shownAtRef.current : null,
      activity: 'flashcard',
    });
    setGraded(prev => ({
      ...prev,
      [current.key]: { correct, confidence: record?.confidence ?? (correct ? 3 : 2) },
    }));

    if (autoSpeak && current.hanzi) speak(current.hanzi, 0.8);
  }, [autoSpeak, current, picked, quiz]);

  const toggleStar = useCallback(() => {
    if (!current) return;
    toggleStarred(current.srsWord);
    setStarDirty(value => value + 1);
  }, [current]);

  const starred = useMemo(
    () => (current ? isStarred(current.srsWord) : false),
    // starDirty buộc đọc lại localStorage sau khi bật/tắt ★.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current, starDirty],
  );

  // Bàn phím: 1/2/3 chọn đáp án, SPACE/Enter/→ sang thẻ sau khi đã trả lời, ← lùi.
  useEffect(() => {
    if (finished || !current) return undefined;
    const onKeyDown = (event) => {
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        if (index > 0) goTo(index - 1);
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        advance();
        return;
      }

      if (!picked) {
        // SPACE/Enter KHÔNG bỏ qua thẻ chưa trả lời. Ở bản trước space là "lật
        // thẻ", nên người dùng cũ sẽ bấm nó theo phản xạ — nếu nó nhảy thẻ thì họ
        // bỏ qua cả bộ mà không hiểu vì sao. Bỏ qua có chủ đích thì dùng → hoặc
        // nút "Bỏ qua".
        const slot = Number(event.key);
        if (quiz && slot >= 1 && slot <= quiz.options.length) {
          event.preventDefault();
          choose(quiz.options[slot - 1]);
        }
        return;
      }

      if (event.code === 'Space' || event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        advance();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [advance, choose, current, finished, goTo, index, picked, quiz]);

  // Skeleton dựng đúng khối của màn thật (đầu trang → thẻ → hàng đáp án) để không
  // bị giật layout lúc dữ liệu về. Không dùng spinner tròn chung chung.
  if (loading) {
    return (
      <main className="core-page page-enter" aria-busy="true">
        <section className="fc-stage fc-stage--skeleton">
          <div className="fc-rail" aria-hidden="true">
            <span className="fc-skeleton fc-skeleton--pill" />
            <span className="fc-skeleton fc-skeleton--pill" />
          </div>
          <div className="fc-skeleton fc-skeleton--card" aria-hidden="true" />
          <div className="fc-choices" aria-hidden="true">
            <span className="fc-skeleton fc-skeleton--grade" />
            <span className="fc-skeleton fc-skeleton--grade" />
            <span className="fc-skeleton fc-skeleton--grade" />
          </div>
          <p className="fc-skeleton-note">Đang tải bộ thẻ</p>
        </section>
      </main>
    );
  }

  if (finished) {
    // Phân bố suy từ dữ liệu đã ghi: "nhớ ngay" = đúng ở nhịp nhanh (mức chắc 4),
    // "nhớ được" = đúng nhưng chậm hơn, "chưa nhớ" = sai.
    const answers = Object.values(graded);
    const counts = {
      solid: answers.filter(row => row.correct && row.confidence >= 4).length,
      slow: answers.filter(row => row.correct && row.confidence < 4).length,
      miss: answers.filter(row => !row.correct).length,
    };
    const total = answers.length || 1;
    const correctCount = counts.solid + counts.slow;
    const accuracy = Math.round((correctCount / total) * 100);
    return (
      <main className="core-page page-enter">
        {/* Tổng kết lệch trục: số lớn bên trái, phân bố ba mức kẻ 1px bên phải. */}
        <section className="fc-recap">
          <div className="fc-recap-lead">
            <span className="core-eyebrow">Kết quả ôn thẻ</span>
            <h1>{accuracy >= 70 ? 'Bộ thẻ này đã vững' : accuracy >= 40 ? 'Đang nhớ dần' : 'Cần ôn lại sớm'}</h1>
            <p>Lịch ôn của từng từ đã tự cập nhật theo kết quả và tốc độ trả lời.</p>
            <button className="btn-primary" onClick={startDeck}>
              <RotateCcw size={16} strokeWidth={1.5} /> Bộ thẻ mới
            </button>
          </div>
          <div className="fc-recap-figures">
            <div className="fc-recap-total">
              <strong>{accuracy}%</strong>
              <span>Đúng {correctCount}/{answers.length} thẻ</span>
            </div>
            <dl className="fc-recap-split">
              {RECAP_BUCKETS.map(bucket => (
                <div key={bucket.id} className={`fc-recap-row ${bucket.className}`}>
                  <dt>{bucket.label}</dt>
                  <dd>
                    <span className="fc-recap-bar" aria-hidden="true">
                      <span style={{ width: `${Math.round((counts[bucket.id] / total) * 100)}%` }} />
                    </span>
                    <b>{counts[bucket.id]}</b>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </main>
    );
  }

  const answeredCorrect = picked !== null && quiz && picked === quiz.answer;

  return (
    <main className="core-page page-enter fc-page">
      <header className="fc-head">
        <div className="fc-head-copy">
          <span className="core-eyebrow">Flashcard</span>
          <h1>Ôn thẻ nhanh</h1>
          <p>Chọn đáp án đúng bằng phím 1 / 2 / 3. Hệ thống tự xếp lại lịch ôn theo kết quả và tốc độ.</p>
        </div>
        <div className="fc-head-controls">
          <div className="control-row">
            <div className="select-label typing-level-label">
              <span>Cấp độ: <em className="typing-level-current">{levelsLabel(levelFilter)}</em></span>
              <HskLevelPicker
                value={levelFilter}
                onChange={next => { setLevelFilter(next); setDeck([]); }}
                variant="chip"
                showAll
                allowEmpty
                className="vocab-hsk-tabs"
                buttonClassName=""
                ariaLabel="Chọn cấp HSK để ôn thẻ"
              />
            </div>
            <label className="select-label">
              <span>Số thẻ:</span>
              <select value={deckSize} onChange={event => { setDeckSize(Number(event.target.value)); setDeck([]); }}>
                {DECK_SIZES.map(size => <option key={size} value={size}>{size} thẻ</option>)}
              </select>
            </label>
            <label className="select-label">
              <span>Chiều hỏi:</span>
              <select value={front} onChange={event => { setFront(event.target.value); setPicked(null); }}>
                <option value="hanzi">Chữ Hán → nghĩa</option>
                <option value="meaning">Nghĩa → chữ Hán</option>
              </select>
            </label>
            <button className="btn-secondary btn-restart" onClick={startDeck}>
              <Shuffle size={15} strokeWidth={1.5} /> Trộn lại
            </button>
          </div>
          <div className="control-row flashcard-toggles">
            <label className="inline-toggle">
              <input type="checkbox" checked={dueOnly} onChange={event => { setDueOnly(event.target.checked); setDeck([]); }} />
              <span>Chỉ từ đến hạn ôn</span>
            </label>
            <label className="inline-toggle">
              <input type="checkbox" checked={autoSpeak} onChange={event => setAutoSpeak(event.target.checked)} />
              <span>Tự phát âm khi hiện đáp án</span>
            </label>
          </div>
        </div>
      </header>

      {current ? (
        <section className="fc-stage">
          {/* Thanh trạng thái: cấp + tiến độ dạng mono, vạch tiến độ là 1px dưới đáy. */}
          <div className="fc-rail">
            <span className="fc-rail-level">HSK {current.level}</span>
            <span className="fc-rail-count">
              <b>{String(index + 1).padStart(2, '0')}</b>
              <i aria-hidden="true">/</i>
              {String(deck.length).padStart(2, '0')}
            </span>
            <span className="fc-rail-track" aria-hidden="true">
              <span style={{ width: `${((index + 1) / deck.length) * 100}%` }} />
            </span>
          </div>

          <div className={`fc-card ${picked ? 'is-flipped' : ''}`}>
            <div className="fc-card-inner">
              {/* Mặt trước: nội dung neo trái-dưới, không căn giữa tuyệt đối. */}
              <div className="fc-face fc-face--front">
                {front === 'hanzi' ? (
                  <h2 className="fc-hanzi">{current.hanzi}</h2>
                ) : (
                  <h2 className="fc-meaning-front">{current.meaning}</h2>
                )}
                <span className="fc-flip-hint">
                  {front === 'hanzi' ? 'Chọn nghĩa đúng' : 'Chọn chữ Hán đúng'}
                </span>
              </div>

              <div className="fc-face fc-face--back">
                <div className="fc-back-head">
                  {front === 'hanzi' ? (
                    <>
                      <span className="fc-pinyin">{current.pinyin}</span>
                      <h2 className="fc-meaning">{current.meaning}</h2>
                    </>
                  ) : (
                    <>
                      <h2 className="fc-hanzi fc-hanzi--back">{current.hanzi}</h2>
                      <span className="fc-pinyin">{current.pinyin}</span>
                    </>
                  )}
                </div>
                {current.example && (
                  <div className="fc-example">
                    <p className="fc-example-cn">{current.example.cn}</p>
                    {current.example.vi && <p className="fc-example-vi">{current.example.vi}</p>}
                  </div>
                )}
                {current.mnemonic && (
                  <p className="fc-mnemonic">
                    <Lightbulb size={14} strokeWidth={1.5} aria-hidden="true" />
                    {current.mnemonic}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="fc-tools">
            <button
              className="fc-tool"
              onClick={() => { if (index > 0) goTo(index - 1); }}
              disabled={index === 0}
              title="Thẻ trước"
            >
              <ChevronLeft size={16} strokeWidth={1.5} /> Trước
            </button>
            <button className="fc-tool" onClick={speakCurrent} title="Nghe phát âm">
              <Volume2 size={16} strokeWidth={1.5} /> Nghe
            </button>
            <button
              className={`fc-tool ${starred ? 'is-starred' : ''}`}
              onClick={toggleStar}
              title="Ghim từ này"
              aria-pressed={starred}
            >
              <Star size={16} strokeWidth={1.5} fill={starred ? 'currentColor' : 'none'} />
              {starred ? 'Đã ghim' : 'Ghim'}
            </button>
            <button className="fc-tool" onClick={advance} title={picked ? 'Thẻ tiếp theo' : 'Bỏ qua thẻ này'}>
              {picked ? 'Tiếp' : 'Bỏ qua'} <ChevronRight size={16} strokeWidth={1.5} />
            </button>
          </div>

          <div className={`fc-choices ${picked ? 'is-answered' : ''}`}>
            {quiz ? (
              quiz.options.map((option, slot) => {
                const isAnswer = option === quiz.answer;
                const state = !picked
                  ? ''
                  : isAnswer ? 'is-correct' : option === picked ? 'is-wrong' : 'is-dim';
                return (
                  <button
                    key={option}
                    className={`fc-choice ${state}`}
                    onClick={() => choose(option)}
                    disabled={Boolean(picked)}
                    lang={answerField === 'hanzi' ? 'zh' : undefined}
                  >
                    <kbd>{slot + 1}</kbd>
                    <span className="fc-choice-text">{option}</span>
                    {picked && isAnswer && <Check size={15} strokeWidth={1.5} aria-hidden="true" />}
                    {picked && !isAnswer && option === picked && <X size={15} strokeWidth={1.5} aria-hidden="true" />}
                  </button>
                );
              })
            ) : (
              <p className="fc-grade-locked">
                Cấp đang lọc chưa đủ từ để dựng đáp án nhiễu. Thẻ này chỉ để xem — chọn thêm cấp HSK để ôn có chấm điểm.
              </p>
            )}
          </div>

          {picked && (
            <p className={`fc-verdict ${answeredCorrect ? 'is-correct' : 'is-wrong'}`} aria-live="polite">
              {answeredCorrect ? 'Đúng' : `Chưa đúng — đáp án là ${quiz.answer}`}
              <span className="fc-verdict-next"><kbd>SPACE</kbd> để tiếp</span>
            </p>
          )}
        </section>
      ) : (
        <section className="fc-empty">
          <span className="fc-empty-mark" aria-hidden="true">
            <AlertCircle size={22} strokeWidth={1.5} />
          </span>
          <div>
            <h2>Chưa có thẻ nào</h2>
            <p>
              {dueOnly
                ? `Không có từ nào đến hạn ôn ở ${levelsLabel(levelFilter)}. Bỏ chọn "Chỉ từ đến hạn ôn" để ôn lại từ bất kỳ.`
                : `Không có từ phù hợp với ${levelsLabel(levelFilter)}. Thử chọn cấp khác.`}
            </p>
            {dueOnly && (
              <button className="btn-secondary" type="button" onClick={() => { setDueOnly(false); setDeck([]); }}>
                Ôn từ bất kỳ
              </button>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
