// ============================================================
// CONFUSABLE PAIRS — Màn "Phân biệt cặp từ dễ nhầm".
//
// Hai lớp: DUYỆT (danh sách cặp + bảng so sánh cạnh nhau) và DRILL (điền từ đúng
// vào chỗ trống trong câu ví dụ thật). Bảng so sánh một mình không đủ — người học
// đọc xong vẫn chọn sai khi vào câu; drill mới là chỗ phân biệt thành phản xạ.
//
// Dữ liệu: confusable-pairs.js (ưu tiên cặp curated từ enrichment LLM, thiếu thì
// tự suy theo mặt chữ / âm / nghĩa). Kết quả drill ghi vào kho SRS per-word như
// mọi hoạt động khác — trả lời sai một từ ở đây thì từ đó bị kéo lên hạn ôn sớm.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, BookOpen, Check, GitCompare, RotateCcw, Volume2, X } from 'lucide-react';
import { speak } from '../speech.jsx';
import { loadAllFlashcards } from '../vocab-loader.js';
import { recordWordReview } from '../vocab-srs.js';
import { buildConfusablePairs, buildPairDrill } from '../confusable-pairs.js';
import HskLevelPicker from './HskLevelPicker.jsx';
import { levelMatches, levelsLabel, normalizeLevels } from '../hsk-levels.js';

const REASON_FILTERS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'curated', label: 'Dễ nhầm khi dùng' },
  { id: 'shape', label: 'Giống mặt chữ' },
  { id: 'sound', label: 'Gần âm' },
  { id: 'meaning', label: 'Gần nghĩa' },
];

// Bảng so sánh 2 cột cho một cặp — cùng cấu trúc thông tin ở cả hai bên để mắt
// so ngang được: chữ, pinyin, nghĩa, cấp, từ loại, một câu ví dụ.
function PairColumn({ entry, onSpeak }) {
  return (
    <div className="pair-column">
      <div className="pair-column-head">
        <h3 className="pair-hanzi">{entry.hanzi}</h3>
        <button
          type="button"
          className="pair-speak-btn"
          onClick={() => onSpeak(entry.hanzi)}
          title={`Nghe phát âm ${entry.hanzi}`}
          aria-label={`Nghe phát âm ${entry.hanzi}`}
        >
          <Volume2 size={15} />
        </button>
      </div>
      <span className="pair-pinyin">{entry.pinyin}</span>
      <p className="pair-meaning">{entry.meaning}</p>
      <div className="pair-tags">
        <span className="hsk-badge">HSK {entry.level}</span>
        {entry.pos && <span className="pos-badge">{entry.pos}</span>}
      </div>
      {entry.examples[0] && (
        <div className="pair-example">
          <p className="example-cn">{entry.examples[0].cn}</p>
          {entry.examples[0].vi && <p className="example-vi">{entry.examples[0].vi}</p>}
        </div>
      )}
    </div>
  );
}

// Drill của một cặp. Mỗi câu 2 lựa chọn; chọn xong hiện ngay đúng/sai + giải
// thích, không đợi hết bài — sai mà biết lý do ngay thì lần sau mới sửa được.
function PairDrill({ pair, onExit }) {
  const rows = useMemo(() => buildPairDrill(pair), [pair]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);

  const current = rows[index];

  const choose = (option) => {
    if (picked || !current) return;
    const correct = option === current.answer;
    setPicked(option);
    if (correct) setScore(value => value + 1);

    // Ghi SRS cho TỪ ĐÍCH của câu. Cặp dễ nhầm là chỗ đo trí nhớ chính xác nhất:
    // chọn đúng giữa hai từ na ná khó hơn nhớ nghĩa đơn lẻ, nên confidence cao hơn.
    const target = current.answer === pair.a.hanzi ? pair.a : pair.b;
    recordWordReview(
      { word_id: target.id, hanzi: target.hanzi, pinyin: target.pinyin, meaning_vi: target.meaning, level: target.level },
      { correct, confidence: correct ? 4 : 3 },
    );
    speak(current.sentence.split('____').join(current.answer), 0.8);
  };

  const next = () => {
    if (index + 1 < rows.length) {
      setIndex(value => value + 1);
      setPicked(null);
    } else {
      setDone(true);
    }
  };

  const restart = () => {
    setIndex(0);
    setPicked(null);
    setScore(0);
    setDone(false);
  };

  if (!rows.length) {
    return (
      <section className="core-card empty-state glass-panel">
        <AlertCircle size={26} />
        <h2>Cặp này chưa có câu luyện</h2>
        <p>
          {pair.a.hanzi} / {pair.b.hanzi} chưa có câu ví dụ tách riêng để khoét chỗ trống.
          Bạn vẫn có thể so sánh ở bảng bên trên.
        </p>
        <button className="btn-secondary" onClick={onExit}><ArrowLeft size={15} /> Về danh sách</button>
      </section>
    );
  }

  if (done) {
    const accuracy = Math.round((score / rows.length) * 100);
    return (
      <section className="qz core-card result-card glass-panel">
        <span className="core-eyebrow">Kết quả phân biệt</span>
        <h1>{pair.a.hanzi} / {pair.b.hanzi}</h1>
        <div className="result-summary">
          <strong className="accuracy-percentage">{accuracy}%</strong>
          <span>Đúng {score} / {rows.length} câu</span>
        </div>
        <p>
          {accuracy === 100
            ? 'Bạn đã phân biệt được cặp này trong ngữ cảnh.'
            : 'Đọc lại bảng so sánh rồi luyện lại, chú ý phần khác nhau về nghĩa.'}
        </p>
        <div className="result-actions">
          <button className="btn-primary" onClick={restart}><RotateCcw size={15} /> Luyện lại</button>
          <button className="btn-secondary" onClick={onExit}><ArrowLeft size={15} /> Về danh sách</button>
        </div>
      </section>
    );
  }

  const isCorrect = picked === current.answer;

  return (
    <section className="qz core-card pair-drill-card glass-panel">
      <div className="question-topline">
        <span className="core-eyebrow">Chọn từ đúng</span>
        <span className="card-progress">{index + 1} / {rows.length}</span>
      </div>
      <div className="progress-bar-container">
        <div className="progress-bar-fill" style={{ width: `${((index + 1) / rows.length) * 100}%` }} />
      </div>

      <p className="pair-drill-sentence">{current.sentence}</p>
      {current.sentenceVi && <p className="pair-drill-vi">{current.sentenceVi}</p>}

      <div className="pair-drill-options">
        {current.options.map(option => {
          const state = !picked
            ? ''
            : option === current.answer
              ? 'option-correct'
              : option === picked ? 'option-wrong' : '';
          return (
            <button
              key={option}
              className={`pair-drill-option ${state}`}
              onClick={() => choose(option)}
              disabled={Boolean(picked)}
            >
              {option}
            </button>
          );
        })}
      </div>

      {picked && (
        <div className={`pair-drill-feedback ${isCorrect ? 'is-correct' : 'is-wrong'}`}>
          <strong>
            {isCorrect ? <><Check size={15} /> Đúng</> : <><X size={15} /> Chưa đúng</>}
          </strong>
          <p>{current.explain}</p>
          <button className="btn-primary" onClick={next}>
            {index + 1 < rows.length ? 'Câu tiếp ►' : 'Xem kết quả'}
          </button>
        </div>
      )}
    </section>
  );
}

export default function ConfusablePairs({ focusLevels }) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [levelFilter, setLevelFilter] = useState(() => normalizeLevels(focusLevels));
  const [reasonFilter, setReasonFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [activeKey, setActiveKey] = useState(null);
  const [drillKey, setDrillKey] = useState(null);

  useEffect(() => {
    let alive = true;
    loadAllFlashcards()
      .then(raw => { if (alive) { setCards(raw); setLoading(false); } })
      .catch(err => {
        console.error('Confusable pairs load error:', err);
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, []);

  // Lọc cấp TRƯỚC khi dựng cặp: cặp chỉ có nghĩa khi cả hai từ đều nằm trong
  // phạm vi người học đang theo, không thì sinh ra cặp với từ chưa từng gặp.
  const pairs = useMemo(() => {
    if (!cards.length) return [];
    const scoped = cards.filter(card => levelMatches(levelFilter, Number(card.hskLevel ?? card.level)));
    return buildConfusablePairs(scoped, { limit: 80 });
  }, [cards, levelFilter]);

  const visiblePairs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pairs
      .filter(pair => reasonFilter === 'all' || pair.reason.id === reasonFilter)
      .filter(pair => !q || [pair.a.hanzi, pair.b.hanzi, pair.a.pinyin, pair.b.pinyin, pair.a.meaning, pair.b.meaning]
        .join(' ').toLowerCase().includes(q));
  }, [pairs, reasonFilter, query]);

  const drillPair = useMemo(
    () => pairs.find(pair => pair.key === drillKey) || null,
    [pairs, drillKey],
  );

  const handleSpeak = useCallback((text) => speak(text, 0.8), []);

  if (loading) {
    return (
      <div className="core-page page-enter tab-loading">
        <div className="spinner-wrapper">
          <BookOpen className="spin" size={32} />
          <p>Đang dựng các cặp từ dễ nhầm...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="core-page page-enter">
      <section className="core-card core-section-head vocab-head glass-panel">
        <div>
          <span className="core-eyebrow">Phân biệt</span>
          <h1>Cặp từ dễ nhầm</h1>
          <p>So sánh hai từ hay bị dùng lẫn, rồi luyện chọn đúng từ trong câu thật.</p>
        </div>
        <div className="vocab-controls">
          <span className="vocab-count">{visiblePairs.length} cặp</span>
          <div className="search-box">
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm chữ, pinyin, nghĩa..." />
          </div>
          <HskLevelPicker
            value={levelFilter}
            onChange={next => { setLevelFilter(next); setActiveKey(null); setDrillKey(null); }}
            variant="chip"
            showAll
            allowEmpty
            className="vocab-hsk-tabs"
            buttonClassName=""
            ariaLabel="Lọc cặp theo cấp HSK"
          />
          <div className="pair-reason-tabs">
            {REASON_FILTERS.map(item => (
              <button
                key={item.id}
                className={reasonFilter === item.id ? 'active' : ''}
                onClick={() => { setReasonFilter(item.id); setActiveKey(null); }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {drillPair ? (
        <PairDrill pair={drillPair} onExit={() => setDrillKey(null)} />
      ) : (
        <section className="pair-workspace">
          {!visiblePairs.length && (
            <div className="core-card empty-state glass-panel">
              <AlertCircle size={26} />
              <h2>Không có cặp nào</h2>
              <p>
                Không tìm được cặp dễ nhầm trong {levelsLabel(levelFilter)}
                {reasonFilter === 'all' ? '' : ` với bộ lọc "${REASON_FILTERS.find(item => item.id === reasonFilter)?.label}"`}.
                Chọn thêm cấp HSK để có đủ từ đối chiếu.
              </p>
            </div>
          )}

          {visiblePairs.map(pair => {
            const open = pair.key === activeKey;
            return (
              <article key={pair.key} className={`core-card pair-card glass-panel ${open ? 'is-open' : ''}`}>
                <button
                  type="button"
                  className="pair-card-head"
                  onClick={() => setActiveKey(open ? null : pair.key)}
                  aria-expanded={open}
                >
                  <span className="pair-title">
                    <GitCompare size={16} />
                    <strong>{pair.a.hanzi}</strong>
                    <em>/</em>
                    <strong>{pair.b.hanzi}</strong>
                  </span>
                  <span className={`pair-reason reason-${pair.reason.id}`}>{pair.reason.label}</span>
                </button>

                {open && (
                  <div className="pair-card-body">
                    <div className="pair-compare">
                      <PairColumn entry={pair.a} onSpeak={handleSpeak} />
                      <div className="pair-divider" aria-hidden="true">vs</div>
                      <PairColumn entry={pair.b} onSpeak={handleSpeak} />
                    </div>
                    <div className="pair-card-actions">
                      <button
                        className="btn-primary"
                        onClick={() => setDrillKey(pair.key)}
                        disabled={!pair.hasDrill}
                        title={pair.hasDrill ? 'Luyện chọn từ đúng trong câu' : 'Cặp này chưa có câu ví dụ để luyện'}
                      >
                        Luyện phân biệt
                      </button>
                      {!pair.hasDrill && <span className="pair-no-drill">Chưa có câu ví dụ riêng để luyện</span>}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
