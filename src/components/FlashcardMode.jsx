// ============================================================
// FLASHCARD MODE — Ôn nhanh bằng thẻ lật, nối thẳng vào kho SRS per-word.
//
// Khác VocabTypingMode (gõ lại từ) và VocabLibrary (tra cứu): đây là nhịp ôn
// NHANH nhất — xem mặt trước, tự nhớ, lật, rồi TỰ ĐÁNH GIÁ. Chính cú tự đánh giá
// đó là đầu vào SRS: không có nút "đã biết/chưa chắc/quên" thì thẻ lật chỉ là
// trò lật qua lật lại, không dạy hệ thống biết nên xếp lại lịch ôn thế nào.
//
// Ánh xạ sang recordWordReview (vocab-srs.js → SM-2 lite, mirror srs_service.py):
//   Đã biết   → correct=true,  confidence=4  → quality 5 (nới interval mạnh)
//   Chưa chắc → correct=true,  confidence=2  → quality 3 (nới interval tối thiểu)
//   Quên      → correct=false, confidence=3  → quality 1 (reset, lapses++)
// Dùng CHUNG word_id với luồng quiz (card.id = 'db-<id>' từ vocab-loader) nên một
// từ chỉ có MỘT lịch ôn, ôn bằng thẻ hay bằng quiz đều cộng dồn vào đó.
// ============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, ChevronLeft, ChevronRight, HelpCircle, Lightbulb, RotateCcw, Shuffle, Star, Volume2, X } from 'lucide-react';
import { speak } from '../speech.jsx';
import { loadAllFlashcards } from '../vocab-loader.js';
import { getDueWords, isStarred, recordWordReview, toggleStarred, wordKeyOf } from '../vocab-srs.js';
import HskLevelPicker from './HskLevelPicker.jsx';
import { levelMatches, levelsLabel, normalizeLevels } from '../hsk-levels.js';

const DECK_SIZES = [10, 20, 30, 50];

// 3 mức tự đánh giá. `confidence` khớp thang 1..4 mà qualityFrom() trong
// vocab-srs.js đang đọc — đổi số ở đây là đổi lịch ôn, không phải đổi nhãn.
const GRADES = [
  { id: 'forgot', label: 'Quên', hint: 'Ôn lại ngay', correct: false, confidence: 3, icon: X, className: 'grade-forgot', key: '1' },
  { id: 'unsure', label: 'Chưa chắc', hint: 'Ôn lại sớm', correct: true, confidence: 2, icon: HelpCircle, className: 'grade-unsure', key: '2' },
  { id: 'known', label: 'Đã biết', hint: 'Giãn lịch ôn', correct: true, confidence: 4, icon: Check, className: 'grade-known', key: '3' },
];

function cleanText(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

// Chuẩn hoá thẻ từ vocab-loader về shape phẳng cho màn này. Giữ `srsWord` riêng
// để truyền nguyên vào recordWordReview/toggleStarred — hai hàm đó đọc word_id,
// hanzi, pinyin, meaning_vi, level.
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

export default function FlashcardMode({ focusLevels }) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [levelFilter, setLevelFilter] = useState(() => normalizeLevels(focusLevels));
  const [deckSize, setDeckSize] = useState(20);
  // 'hanzi' = mặt trước chữ Hán (nhận diện). 'meaning' = mặt trước nghĩa Việt
  // (chủ động gợi lại chữ — khó hơn, gần với lúc cần nói/viết thật).
  const [front, setFront] = useState('hanzi');
  const [dueOnly, setDueOnly] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);

  const [deck, setDeck] = useState([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [graded, setGraded] = useState({});
  const [finished, setFinished] = useState(false);
  const [starDirty, setStarDirty] = useState(0);

  // Mốc thời gian lúc thẻ hiện ra → latency thật cho qualityFrom(). Không đo thì
  // mọi câu "Đã biết" đều được tính như trả lời tức thì. Khởi tạo 0 (không gọi
  // Date.now() trong lúc render); startDeck/goTo đặt mốc thật trước thẻ đầu tiên.
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

  const pool = useMemo(() => {
    const byLevel = cards.filter(card => levelMatches(levelFilter, card.level));
    if (!dueOnly) return byLevel;
    // Chỉ ôn từ ĐẾN HẠN: lấy khoá từ kho SRS rồi giao với pool đang lọc. So khớp
    // bằng wordKeyOf để dùng đúng key space với luồng quiz (word_id, không phải hanzi).
    const dueKeys = new Set(getDueWords(200).map(record => wordKeyOf(record)).filter(Boolean));
    return byLevel.filter(card => dueKeys.has(wordKeyOf(card.srsWord)));
  }, [cards, levelFilter, dueOnly]);

  const startDeck = useCallback(() => {
    setDeck(shuffle(pool).slice(0, deckSize));
    setIndex(0);
    setFlipped(false);
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

  const speakCurrent = useCallback(() => {
    if (current?.hanzi) speak(current.hanzi, 0.8);
  }, [current]);

  const flip = useCallback(() => {
    setFlipped(prev => {
      const next = !prev;
      if (next && autoSpeak && current?.hanzi) speak(current.hanzi, 0.8);
      return next;
    });
  }, [autoSpeak, current]);

  const goTo = useCallback((nextIndex) => {
    setIndex(nextIndex);
    setFlipped(false);
    shownAtRef.current = Date.now();
  }, []);

  // Chấm rồi tự sang thẻ sau. Ghi SRS ngay tại đây (không dồn về cuối phiên) để
  // người dùng thoát giữa phiên vẫn giữ được tiến độ đã ôn.
  const grade = useCallback((gradeId) => {
    if (!current) return;
    const spec = GRADES.find(row => row.id === gradeId);
    if (!spec) return;

    recordWordReview(current.srsWord, {
      correct: spec.correct,
      confidence: spec.confidence,
      latencyMs: Date.now() - shownAtRef.current,
    });
    setGraded(prev => ({ ...prev, [current.key]: gradeId }));

    if (index + 1 < deck.length) goTo(index + 1);
    else setFinished(true);
  }, [current, deck.length, index, goTo]);

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

  // Bàn phím: SPACE lật (giống thói quen Anki/Quizlet), ←/→ chuyển thẻ, 1/2/3 chấm.
  useEffect(() => {
    if (finished || !current) return undefined;
    const onKeyDown = (event) => {
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (event.code === 'Space' || event.key === ' ') {
        event.preventDefault();
        flip();
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        if (index + 1 < deck.length) goTo(index + 1);
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        if (index > 0) goTo(index - 1);
        return;
      }
      const hit = GRADES.find(row => row.key === event.key);
      if (hit && flipped) {
        event.preventDefault();
        grade(hit.id);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [finished, current, flip, flipped, grade, goTo, index, deck.length]);

  // Skeleton dựng đúng khối của màn thật (đầu trang → thẻ → hàng chấm) để không
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
          <div className="fc-grade-row" aria-hidden="true">
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
    const counts = GRADES.reduce((acc, spec) => {
      acc[spec.id] = Object.values(graded).filter(value => value === spec.id).length;
      return acc;
    }, {});
    const total = deck.length || 1;
    const solid = Math.round((counts.known / total) * 100);
    return (
      <main className="core-page page-enter">
        {/* Tổng kết lệch trục: số lớn bên trái, phân bố ba mức kẻ 1px bên phải. */}
        <section className="fc-recap">
          <div className="fc-recap-lead">
            <span className="core-eyebrow">Kết quả ôn thẻ</span>
            <h1>{solid >= 70 ? 'Bộ thẻ này đã vững' : solid >= 40 ? 'Đang nhớ dần' : 'Cần ôn lại sớm'}</h1>
            <p>Lịch ôn của từng từ đã được cập nhật theo mức bạn tự đánh giá.</p>
            <button className="btn-primary" onClick={startDeck}>
              <RotateCcw size={16} strokeWidth={1.5} /> Bộ thẻ mới
            </button>
          </div>
          <div className="fc-recap-figures">
            <div className="fc-recap-total">
              <strong>{solid}%</strong>
              <span>Đã biết {counts.known}/{deck.length} thẻ</span>
            </div>
            <dl className="fc-recap-split">
              {GRADES.map(spec => (
                <div key={spec.id} className={`fc-recap-row ${spec.className}`}>
                  <dt>{spec.label}</dt>
                  <dd>
                    <span className="fc-recap-bar" aria-hidden="true">
                      <span style={{ width: `${Math.round((counts[spec.id] / total) * 100)}%` }} />
                    </span>
                    <b>{counts[spec.id]}</b>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="core-page page-enter fc-page">
      <header className="fc-head">
        <div className="fc-head-copy">
          <span className="core-eyebrow">Flashcard</span>
          <h1>Ôn thẻ lật</h1>
          <p>Nhấn thẻ hoặc phím SPACE để lật. Tự đánh giá bằng phím 1 / 2 / 3, hệ thống xếp lại lịch ôn theo đó.</p>
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
              <span>Mặt trước:</span>
              <select value={front} onChange={event => { setFront(event.target.value); setFlipped(false); }}>
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
              <span>Tự phát âm khi lật</span>
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

          <div
            className={`fc-card ${flipped ? 'is-flipped' : ''}`}
            onClick={flip}
            onKeyDown={event => { if (event.key === 'Enter') flip(); }}
            role="button"
            tabIndex={0}
            aria-label={flipped ? 'Mặt sau của thẻ, nhấn để lật lại' : 'Mặt trước của thẻ, nhấn để lật xem nghĩa'}
          >
            <div className="fc-card-inner">
              {/* Mặt trước: nội dung neo trái-dưới, không căn giữa tuyệt đối. */}
              <div className="fc-face fc-face--front">
                {front === 'hanzi' ? (
                  <h2 className="fc-hanzi">{current.hanzi}</h2>
                ) : (
                  <h2 className="fc-meaning-front">{current.meaning}</h2>
                )}
                <span className="fc-flip-hint">
                  <kbd>SPACE</kbd> để lật
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
            <button
              className="fc-tool"
              onClick={() => { if (index + 1 < deck.length) goTo(index + 1); else setFinished(true); }}
              title="Bỏ qua thẻ này"
            >
              Bỏ qua <ChevronRight size={16} strokeWidth={1.5} />
            </button>
          </div>

          <div className={`fc-grade-row ${flipped ? 'is-open' : ''}`}>
            {flipped ? (
              GRADES.map(spec => {
                const Icon = spec.icon;
                return (
                  <button
                    key={spec.id}
                    className={`fc-grade ${spec.className}`}
                    onClick={() => grade(spec.id)}
                  >
                    <span className="fc-grade-top">
                      <Icon size={15} strokeWidth={1.5} />
                      <strong>{spec.label}</strong>
                      <kbd>{spec.key}</kbd>
                    </span>
                    <span className="fc-grade-hint">{spec.hint}</span>
                  </button>
                );
              })
            ) : (
              <p className="fc-grade-locked">Lật thẻ trước, rồi tự đánh giá để hệ thống xếp lịch ôn.</p>
            )}
          </div>
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
