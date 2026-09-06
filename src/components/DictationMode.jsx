// ============================================================
// DICTATION-MODE — Nghe viết (chính tả). Bốn chế độ, một khuôn chấm điểm.
//
//   1. TỪ       — nghe một từ, gõ chữ Hán. Tín hiệu MỨC TỪ.
//   2. CÂU      — nghe một câu, gõ lại cả câu. Tín hiệu MỨC CÂU.
//   3. BÀI KHÓA — nghe từng câu của một bài trong kho, dừng được giữa câu.
//   4. HỘI THOẠI — DÁN hội thoại từ ngoài vào, nghe từng lượt nói rồi viết theo.
//
// Vì sao chính tả là tín hiệu đáng ghi vào lịch ôn: nó buộc gợi lại chữ từ ÂM,
// không có mặt chữ để nhận diện và cũng không có lựa chọn để loại trừ. Đây là
// dạng bài khắt khe nhất trong app, khắt khe hơn cả gõ từ (màn đó cho nghĩa
// tiếng Việt, tức đã cho một mỏ neo).
//
// Không có nút tự đánh giá: đúng/sai suy từ so khớp, còn "chắc đến đâu" suy từ
// độ trễ + số lần nghe lại (auto-confidence.js).
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, BookOpen, Check, ChevronLeft, ChevronRight, ClipboardPaste, Ear,
  FileText, Headphones, MessagesSquare, Pause, Play, Repeat, RotateCcw, Trash2,
  Type, XCircle,
} from 'lucide-react';
import { pauseSpeech, resumeSpeech, speak, stopSpeech } from '../speech.jsx';
import { loadAllFlashcards } from '../vocab-loader.js';
import { fetchTranslationItems } from '../api-core';
import { examPassages } from '../data/exam-passages.js';
import { hasHan, parseDialogueLines, splitSentences } from '../sentence-split.js';
import { captureSentenceReview, captureWordReview } from '../srs-capture.js';
import { ClickableChineseText } from './chinese-text.jsx';
import HskLevelPicker from './HskLevelPicker.jsx';
import { scopedKey } from '../user-scope.js';
import { effectiveLevels, levelMatches, levelsLabel, normalizeLevels, primaryLevel } from '../hsk-levels.js';

// Đọc giờ ở cấp module: eslint react-hooks/purity chặn Date.now() trong thân
// render, và useRef(Date.now()) cũng bị tính là đọc lúc render.
const clockNow = () => Date.now();

const MODES = [
  { id: 'word', label: 'Viết từ', icon: Type, hint: 'Nghe một từ, gõ lại chữ Hán.' },
  { id: 'sentence', label: 'Viết câu', icon: FileText, hint: 'Nghe cả câu, gõ lại đầy đủ.' },
  { id: 'passage', label: 'Viết bài khóa', icon: BookOpen, hint: 'Nghe từng câu của bài, dừng được giữa câu.' },
  { id: 'dialogue', label: 'Hội thoại dán vào', icon: MessagesSquare, hint: 'Dán hội thoại của bạn, nghe từng lượt nói rồi viết theo.' },
];

const COUNT_OPTIONS = [5, 10, 20];

// Hội thoại đã dán, giữ lại giữa các phiên. Người học dán từ sách/app khác — đổi
// tab rồi quay lại mà mất sạch thì họ phải đi copy lại từ đầu.
const DIALOGUE_KEY = 'dictationDialogue';

// Lượt nói dài hơn mốc này (tính theo chữ Hán) được cắt tiếp thành câu: giữ
// nguyên cả lượt thì người học phải nhớ một đoạn quá dài để viết lại, và mỗi lỗi
// nhỏ đánh sập cả lượt.
const MAX_TURN_HAN = 24;

// Nghe lại từ mốc này trở lên thì dù viết đúng cũng chỉ được mức 3, không lên 4.
// Nghe ba lần mới viết đúng không phải là "đã thành phản xạ".
const REPLAY_CAP_THRESHOLD = 2;
const CAPPED_CONFIDENCE = 3;

// Chuẩn hoá trước khi so: bỏ khoảng trắng và MỌI dấu câu, chỉ so phần chữ.
// Người học nghe không thể biết tác giả dùng "，" hay "、", cũng không nghe được
// dấu chấm — trừ điểm vì dấu câu là trừ sai chỗ.
//
// Viết bằng \uXXXX cho các dấu toàn phần: dấu ngoặc kép cong và gạch ngang dài
// rất dễ bị biến thành dấu thẳng ASCII khi file đi qua một khâu đổi encoding, và
// mất âm thầm — bank bài khóa CÓ dùng “ ” và —, nên lọt là chấm sai người học.
const PUNCTUATION_RE = new RegExp(
  '[\\s\\u3000'
  + '\\uFF0C\\u3002\\uFF01\\uFF1F\\u3001\\uFF1A\\uFF1B'   // ，。！？、：；
  + '\\u201C\\u201D\\u2018\\u2019'                         // “ ” ‘ ’
  + '\\uFF08\\uFF09\\u300A\\u300B\\u300C\\u300D\\u300E\\u300F' // （）《》「」『』
  + '\\u2014\\u2013\\u2026\\uFF5E'                         // — – … ～
  + ',.!?:;"\'()\\-]',
  'g',
);

// Đơn vị chính tả phải có chữ để viết. splitSentences khớp backend nên một mảnh
// chỉ gồm dấu câu (vd đoạn có "。。") vẫn ra một phần tử — để lọt thì người học
// gặp một câu không thể gõ gì và không cách nào qua được.
const HAS_HAN_RE = /[一-鿿㐀-䶿]/;

function normalizeChinese(value) {
  return String(value || '').replace(PUNCTUATION_RE, '');
}

// Số chữ Hán trong một chuỗi — dùng để quyết định có cắt lượt nói dài hay không.
function hanCount(text) {
  return normalizeChinese(text).length;
}

function isMatch(input, target) {
  const a = normalizeChinese(input);
  const b = normalizeChinese(target);
  return Boolean(a) && a === b;
}

// So từng ký tự giữa bản gõ và bản gốc (đã bỏ dấu câu). Trả về mảng ô để hiện
// diff. Không dùng thuật toán căn chỉnh (Levenshtein) vì gõ thiếu một chữ ở giữa
// sẽ làm toàn bộ phần sau bị đánh dấu sai — với chính tả thì so theo vị trí là
// đủ để người học thấy mình lệch từ đâu.
function diffChars(input, target) {
  const typed = normalizeChinese(input);
  const answer = normalizeChinese(target);
  const rows = [];
  const max = Math.max(typed.length, answer.length);
  for (let i = 0; i < max; i += 1) {
    const want = answer[i] || '';
    const got = typed[i] || '';
    let status = 'ok';
    if (!got) status = 'missing';
    else if (!want) status = 'extra';
    else if (got !== want) status = 'wrong';
    rows.push({ key: `${i}-${want}-${got}`, want, got, status });
  }
  return rows;
}

// Ký hiệu KHÔNG dùng màu cho mỗi trạng thái. Chỉ tô màu là rào cản với người mù
// màu — đỏ/xanh là cặp khó phân biệt nhất ở dạng phổ biến nhất (deuteranopia).
const DIFF_MARK = {
  ok: '✓',
  wrong: '✕',
  missing: '␣',
  extra: '+',
};

const DIFF_LABEL = {
  ok: 'đúng',
  wrong: 'sai',
  missing: 'thiếu',
  extra: 'thừa',
};

function toSentenceItem(text, level, key) {
  return { kind: 'sentence', key, text, pinyin: '', meaning: '', level: Number(level) || 0 };
}

// Nguồn câu: pool backend trước, thiếu thì lấy câu ví dụ của thẻ.
//
// Pool /api/translation/items hiện rất mỏng (translation_pool.json chỉ có vài
// câu, đều ở một cấp) nên nhánh degrade không phải phòng xa — nó là nhánh chạy
// thật cho gần hết các cấp.
async function loadSentencePool({ cards, levelFilter, count }) {
  const rows = [];
  const seen = new Set();
  const push = (text, level, key) => {
    const clean = String(text || '').trim();
    if (!clean || seen.has(clean)) return;
    seen.add(clean);
    rows.push(toSentenceItem(clean, level, key));
  };

  const level = primaryLevel(levelFilter);
  try {
    const data = await fetchTranslationItems({ hsk_level: level, count });
    (data?.items || []).forEach((item, i) => push(item.sentence_cn, item.hsk_level ?? level, `t-${i}`));
  } catch {
    // Backend ngủ/lỗi: đi tiếp bằng câu ví dụ trong kho thẻ.
  }

  if (rows.length < count) {
    const pool = (cards || []).filter(card => levelMatches(levelFilter, card.hskLevel));
    for (const card of [...pool].sort(() => Math.random() - 0.5)) {
      if (rows.length >= count) break;
      const example = card.examples?.[0]?.cn || card.exampleSentence;
      push(example, card.hskLevel, `c-${card.id ?? card.character}`);
    }
  }

  return rows.slice(0, count);
}

// Một bài khóa ngẫu nhiên trong các cấp đang chọn.
function pickPassage(levels) {
  const pool = (examPassages?.reading || []).filter(row => levels.includes(Number(row.hsk_level)));
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

// Hội thoại đã dán: đọc/ghi localStorage, namespace theo user (scopedKey) như mọi
// dữ liệu học cục bộ khác — hai tài khoản trên cùng máy không thấy bài của nhau.
function readSavedDialogue() {
  try {
    return window.localStorage.getItem(scopedKey(DIALOGUE_KEY)) || '';
  } catch {
    return '';
  }
}

function writeSavedDialogue(text) {
  try {
    if (text) window.localStorage.setItem(scopedKey(DIALOGUE_KEY), text);
    else window.localStorage.removeItem(scopedKey(DIALOGUE_KEY));
  } catch {
    // localStorage đầy/bị khoá → bài dán chỉ còn trong phiên này.
  }
}

// Hội thoại dán vào → danh sách đơn vị nghe viết. Mỗi lượt nói là một đơn vị;
// lượt quá dài thì cắt tiếp theo câu nhưng GIỮ tên người nói của lượt đó, để vẫn
// biết ai đang nói ở từng mảnh.
function buildDialogueItems(text) {
  const items = [];
  parseDialogueLines(text).forEach((turn, turnIndex) => {
    const pieces = hanCount(turn.text) > MAX_TURN_HAN
      ? splitSentences(turn.text).filter(hasHan)
      : [turn.text];
    // splitSentences có thể trả rỗng nếu lượt chỉ có dấu câu; hasHan ở
    // parseDialogueLines đã lọc nên trường hợp đó chỉ xảy ra khi cắt lỗi.
    (pieces.length ? pieces : [turn.text]).forEach((piece, pieceIndex) => {
      items.push({
        kind: 'dialogue',
        key: `d-${turnIndex}-${pieceIndex}`,
        text: piece,
        pinyin: '',
        meaning: '',
        level: 0,
        speaker: turn.speaker,
        // Lượt bị cắt: đánh dấu để UI nói rõ đây là một phần của lượt, tránh làm
        // người học tưởng mình nghe thiếu.
        partOfTurn: pieces.length > 1 ? `${pieceIndex + 1}/${pieces.length}` : '',
      });
    });
  });
  return items;
}

export default function DictationMode({ focusLevels }) {
  const [mode, setMode] = useState('word');
  const [levelFilter, setLevelFilter] = useState(() => normalizeLevels(focusLevels));
  const [count, setCount] = useState(10);

  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [buildingItems, setBuildingItems] = useState(false);
  const [notice, setNotice] = useState('');

  const [index, setIndex] = useState(0);
  const [inputValue, setInputValue] = useState('');
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);

  // Hội thoại dán vào. `dialogueDraft` là nội dung trong ô soạn, `dialogueText`
  // là nội dung ĐÃ chốt để luyện — tách hai cái để người học sửa ô soạn giữa
  // phiên mà phiên đang chạy không bị dựng lại dưới chân họ.
  const [dialogueDraft, setDialogueDraft] = useState(() => readSavedDialogue());
  const [dialogueText, setDialogueText] = useState(() => readSavedDialogue());

  // Số lần nghe lại, đếm THEO ĐƠN VỊ (khoá theo item.key) chứ không phải một biến
  // dồn rồi reset khi sang câu: đi lùi về câu trước phải thấy lại đúng số lần đã
  // nghe của câu đó, và reset trong effect là thứ lint chặn.
  const [replayMap, setReplayMap] = useState({});
  // Tăng mỗi lần mở phiên mới. Effect tự phát khoá theo item.key, nên trộn lại mà
  // ra trúng đơn vị đầu giống hệt phiên trước thì key không đổi và câu đầu sẽ
  // không được phát — ở chế độ bài khóa chỉ có 24 bài nên trúng lại là chuyện
  // thường, không phải hiếm.
  const [sessionId, setSessionId] = useState(0);
  // Mốc lúc đơn vị hiện ra, để tính độ trễ thật.
  const startedAtRef = useRef(0);
  // Đơn vị đã ghi SRS: nút Kiểm tra gọi được cả từ chuột và từ Enter.
  const capturedRef = useRef(new Set());
  const inputRef = useRef(null);

  const levels = useMemo(() => effectiveLevels(levelFilter), [levelFilter]);

  useEffect(() => {
    let alive = true;
    loadAllFlashcards().then(raw => {
      if (!alive) return;
      setCards(raw || []);
      setLoading(false);
    }).catch(() => {
      if (!alive) return;
      setCards([]);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  // Xây danh sách đơn vị luyện tập cho chế độ đang chọn. Mỗi đơn vị là một lần
  // nghe → viết, bất kể chế độ, nên phần chấm/điều khiển bên dưới dùng chung.
  const buildItems = useCallback(async () => {
    setBuildingItems(true);
    setNotice('');
    stopSpeech();
    try {
      if (mode === 'word') {
        const pool = (cards || []).filter(card => card.character && levelMatches(levelFilter, card.hskLevel));
        const picked = [...pool].sort(() => Math.random() - 0.5).slice(0, count);
        if (!picked.length) setNotice(`Chưa có từ nào cho ${levelsLabel(levelFilter)}.`);
        return picked.map(card => ({
          kind: 'word',
          key: `w-${card.id ?? card.character}`,
          text: card.character,
          pinyin: card.pinyin || '',
          meaning: card.meaning || '',
          level: Number(card.hskLevel) || 0,
          srsWord: {
            word_id: card.id ?? null,
            hanzi: card.character,
            pinyin: card.pinyin || '',
            meaning_vi: card.meaning || '',
            level: Number(card.hskLevel) || 0,
          },
        }));
      }

      if (mode === 'sentence') {
        const rows = await loadSentencePool({ cards, levelFilter, count });
        if (!rows.length) setNotice(`Chưa có câu cho ${levelsLabel(levelFilter)}.`);
        return rows;
      }

      if (mode === 'dialogue') {
        const rows = buildDialogueItems(dialogueText);
        // Không đặt notice khi ô còn trống: chưa dán gì thì đó là trạng thái bình
        // thường, không phải lỗi — UI hiện ô dán thay vì hiện báo lỗi.
        if (!rows.length && dialogueText.trim()) {
          setNotice('Không tìm thấy dòng tiếng Trung nào trong đoạn bạn dán. Kiểm tra lại nội dung.');
        }
        return rows;
      }

      const chosen = pickPassage(levels);
      if (!chosen) {
        setNotice(`Chưa có bài khóa cho ${levelsLabel(levelFilter)}.`);
        return [];
      }
      const sentences = splitSentences(chosen.passage).filter(text => HAS_HAN_RE.test(text));
      if (!sentences.length) {
        setNotice('Bài khóa này không cắt được thành câu.');
        return [];
      }
      return sentences.map((text, i) => ({
        kind: 'passage',
        key: `${chosen.id}-${i}`,
        text,
        pinyin: '',
        meaning: '',
        level: Number(chosen.hsk_level) || 0,
        passageId: chosen.id,
      }));
    } finally {
      setBuildingItems(false);
    }
  }, [cards, count, dialogueText, levelFilter, levels, mode]);

  const current = items[index] || null;
  const replays = current ? (replayMap[current.key] || 0) : 0;

  // Phát một đơn vị. `isReplay` để đếm số lần nghe lại — chỉ lần nghe THÊM mới
  // tính, lần phát đầu tiên khi đơn vị vừa hiện thì không.
  const play = useCallback((item, isReplay = false) => {
    const clean = String(item?.text || '').trim();
    if (!clean) return;
    if (isReplay) {
      setReplayMap(prev => ({ ...prev, [item.key]: (prev[item.key] || 0) + 1 }));
    }
    setPaused(false);
    setPlaying(true);
    speak(clean, 0.82, () => setPlaying(false));
  }, []);

  const togglePause = useCallback(() => {
    if (paused) {
      // resumeSpeech trả false khi không còn gì để tiếp (clip đã đọc xong, hoặc
      // engine browser TTS không hỗ trợ resume) — lúc đó phát lại từ đầu câu và
      // tính là một lần nghe lại, vì người học thực sự đã nghe lại cả câu.
      if (!resumeSpeech()) {
        play(current, true);
        return;
      }
      setPaused(false);
      setPlaying(true);
      return;
    }
    if (!playing) {
      // Clip đã đọc hết: nút đang là "Phát" nên phải phát, không phải thử dừng.
      play(current, true);
      return;
    }
    if (pauseSpeech()) {
      setPaused(true);
      setPlaying(false);
    }
  }, [current, paused, play, playing]);

  const applySession = useCallback((built) => {
    setItems(built);
    setIndex(0);
    setInputValue('');
    setChecked(false);
    setScore(0);
    setFinished(false);
    setPaused(false);
    setPlaying(false);
    setReplayMap({});
    setSessionId(value => value + 1);
    capturedRef.current = new Set();
    startedAtRef.current = clockNow();
  }, []);

  const startSession = useCallback(async () => {
    applySession(await buildItems());
  }, [applySession, buildItems]);

  // Chốt đoạn đang soạn thành bài luyện. dialogueText đổi → buildItems chạy lại
  // qua effect bên dưới, nên không cần gọi startSession ở đây.
  const applyDialogue = useCallback(() => {
    const text = dialogueDraft.trim();
    setDialogueText(text);
    writeSavedDialogue(text);
  }, [dialogueDraft]);

  const clearDialogue = useCallback(() => {
    stopSpeech();
    setDialogueDraft('');
    setDialogueText('');
    writeSavedDialogue('');
  }, []);

  // Dán bằng nút: tiện trên mobile, nơi Ctrl+V không có sẵn. navigator.clipboard
  // cần quyền và chỉ chạy trên HTTPS/localhost — thất bại thì im lặng, người học
  // vẫn dán tay được vào textarea.
  const pasteFromClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setDialogueDraft(prev => (prev ? `${prev}\n${text}` : text));
    } catch {
      setNotice('Trình duyệt không cho đọc clipboard. Hãy dán tay vào ô bên dưới (Ctrl+V).');
    }
  }, []);

  // Mở phiên khi đổi chế độ / cấp / số lượng, và ngay sau khi kho thẻ nạp xong.
  useEffect(() => {
    if (loading) return;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- danh sách đơn vị chỉ dựng được sau khi fetch/nạp kho xong; đây là đồng bộ với hệ thống ngoài
    buildItems().then(built => { if (alive) applySession(built); });
    return () => { alive = false; };
  }, [applySession, buildItems, loading]);

  // Dừng âm khi rời màn: speak() phát qua module dùng chung nên câu đang đọc sẽ
  // đọc nốt ở tab khác nếu không dọn.
  useEffect(() => () => stopSpeech(), []);

  // Tự phát khi sang đơn vị mới và đặt lại mốc đo độ trễ. Không reset số lần nghe
  // lại ở đây: replayMap khoá theo đơn vị nên đi lùi vẫn thấy đúng số của câu đó.
  useEffect(() => {
    if (!current || finished) return;
    startedAtRef.current = clockNow();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- play() ra lệnh cho engine TTS (hệ thống ngoài); cờ playing chỉ phản ánh trạng thái của engine đó
    play(current);
    inputRef.current?.focus();
    // Chỉ chạy khi ĐỔI đơn vị (hoặc mở phiên mới). Thêm `play`/`current` vào deps
    // sẽ chạy lại mỗi lần state phát đổi và phát chồng lên chính nó.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.key, sessionId, finished]);

  // Ghi lịch ôn cho một đơn vị đã chấm. Ghi ngay tại lượt trả lời, không dồn về
  // cuối phiên: thoát giữa phiên vẫn giữ được tiến độ.
  const captureUnit = useCallback((item, correct, replayCount) => {
    if (!item || capturedRef.current.has(item.key)) return;
    capturedRef.current.add(item.key);

    if (item.kind === 'word') {
      const latencyMs = startedAtRef.current ? clockNow() - startedAtRef.current : null;
      // Nghe lại nhiều lần thì chặn mức trên: viết đúng sau hai, ba lần nghe là
      // bằng chứng yếu hơn viết đúng ngay lần đầu. Chỉ chặn khi ĐÚNG — chặn cả
      // nhánh sai sẽ vô tình làm nhẹ hình phạt cho từ chưa nhớ.
      const capped = correct && replayCount >= REPLAY_CAP_THRESHOLD;
      captureWordReview({
        word: item.srsWord,
        correct,
        latencyMs,
        activity: 'dictation',
        confidence: capped ? CAPPED_CONFIDENCE : null,
      });
      return;
    }

    // Mức câu: captureSentenceReview tự cắt câu theo kho từ và tự bỏ qua câu sai
    // (câu sai không cho biết chữ nào gây lỗi). Không await — ghi SRS là việc
    // phụ, không được chặn lúc hiện kết quả.
    captureSentenceReview({ text: item.text, correct });
  }, []);

  const submit = useCallback(() => {
    if (!current || checked) return;
    const correct = isMatch(inputValue, current.text);
    if (correct) setScore(prev => prev + 1);
    captureUnit(current, correct, replays);
    setChecked(true);
    stopSpeech();
    setPlaying(false);
    setPaused(false);
  }, [captureUnit, checked, current, inputValue, replays]);

  const goTo = useCallback((nextIndex) => {
    if (nextIndex < 0 || nextIndex >= items.length) return;
    // Dừng trước khi chuyển: không dừng thì câu cũ đọc nốt và chồng lên câu mới
    // do effect phát tự động.
    stopSpeech();
    setPlaying(false);
    setPaused(false);
    setIndex(nextIndex);
    setInputValue('');
    setChecked(false);
  }, [items.length]);

  const next = useCallback(() => {
    if (index + 1 < items.length) {
      goTo(index + 1);
      return;
    }
    stopSpeech();
    setPlaying(false);
    setFinished(true);
  }, [goTo, index, items.length]);

  const handleKeyDown = (event) => {
    // IME tiếng Trung đang chọn chữ: Enter là để chốt chữ, không phải nộp bài.
    if (event.nativeEvent?.isComposing || event.isComposing) return;
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (checked) next();
    else submit();
  };

  const diff = useMemo(
    () => (checked && current ? diffChars(inputValue, current.text) : null),
    [checked, current, inputValue],
  );
  const correctNow = checked && current ? isMatch(inputValue, current.text) : false;
  const modeMeta = MODES.find(entry => entry.id === mode) || MODES[0];
  const unitLabel = mode === 'word' ? 'từ' : 'câu';

  if (loading) {
    return (
      <div className="core-page page-enter tab-loading">
        <div className="spinner-wrapper">
          <Ear className="spin" size={32} />
          <p>Đang tải dữ liệu nghe viết...</p>
        </div>
      </div>
    );
  }

  const controls = (
    <section className="core-card core-section-head dict-head glass-panel">
      <div>
        <span className="core-eyebrow">Nghe viết</span>
        <h1>Chính tả tiếng Trung</h1>
        <p>{modeMeta.hint} Không cần tự chấm điểm — lịch ôn tự xếp theo kết quả, tốc độ và số lần nghe lại.</p>
      </div>
      <div className="dict-controls">
        <div className="dict-mode-row" role="group" aria-label="Chọn chế độ nghe viết">
          {MODES.map(entry => {
            const Icon = entry.icon;
            return (
              <button
                key={entry.id}
                type="button"
                className={`dict-mode-btn ${mode === entry.id ? 'is-active' : ''}`}
                onClick={() => setMode(entry.id)}
                aria-pressed={mode === entry.id}
              >
                <Icon size={15} /> {entry.label}
              </button>
            );
          })}
        </div>
        <div className="control-row">
          <div className="select-label">
            <span>Cấp độ: <em>{levelsLabel(levelFilter)}</em></span>
            <HskLevelPicker
              value={levelFilter}
              onChange={setLevelFilter}
              variant="chip"
              showAll
              allowEmpty
              className="vocab-hsk-tabs"
              buttonClassName=""
              ariaLabel="Chọn cấp HSK để nghe viết"
            />
          </div>
          {mode !== 'passage' && (
            <label className="select-label">
              <span>Số {unitLabel}:</span>
              <select value={count} onChange={event => setCount(Number(event.target.value))}>
                {COUNT_OPTIONS.map(value => (
                  <option key={value} value={value}>{value} {unitLabel}</option>
                ))}
              </select>
            </label>
          )}
          <button className="btn-secondary btn-restart" onClick={startSession} disabled={buildingItems}>
            <RotateCcw size={15} /> {mode === 'passage' ? 'Bài khác' : 'Trộn lại'}
          </button>
        </div>
      </div>
    </section>
  );

  if (finished) {
    const accuracy = items.length ? Math.round((score / items.length) * 100) : 0;
    return (
      <main className="core-page page-enter">
        {controls}
        <section className="qz core-card result-card general-result-card glass-panel">
          <span className="core-eyebrow">Kết quả nghe viết</span>
          <h1>{accuracy >= 80 ? 'Xuất sắc!' : accuracy >= 50 ? 'Khá tốt!' : 'Cần luyện thêm'}</h1>
          <div className="result-summary">
            <strong className="accuracy-percentage">{accuracy}%</strong>
            <span>Viết đúng {score} / {items.length} {unitLabel}</span>
          </div>
          <div className="result-actions">
            <button className="btn-primary" onClick={startSession}>
              <RotateCcw size={16} /> Luyện phiên mới
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (!current) {
    return (
      <main className="core-page page-enter">
        {controls}
        <div className="core-card empty-state glass-panel">
          <AlertCircle size={28} />
          <h2>Chưa có nội dung để nghe viết</h2>
          <p>{notice || `Không tìm được nội dung phù hợp với ${levelsLabel(levelFilter)}. Hãy thử cấp khác.`}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="core-page page-enter">
      {controls}

      <section className="qz core-card dict-card glass-panel">
        <div className="question-topline">
          <span className="hsk-badge">HSK {current.level || primaryLevel(levelFilter)}</span>
          <span className="card-progress">
            {mode === 'passage' ? `Câu ${index + 1} / ${items.length}` : `${index + 1} / ${items.length}`}
          </span>
        </div>

        <div className="progress-bar-container">
          <div className="progress-bar-fill" style={{ width: `${((index + 1) / items.length) * 100}%` }} />
        </div>

        <div className="dict-audio-panel">
          <span className="eyebrow-label">
            {mode === 'word' ? 'Nghe và viết lại từ' : 'Nghe và viết lại câu'}
          </span>
          <div className="dict-audio-actions">
            <button className="btn-primary dict-audio-btn" type="button" onClick={togglePause}>
              {paused || !playing ? <Play size={16} /> : <Pause size={16} />}
              {paused ? ' Tiếp tục' : playing ? ' Tạm dừng' : ' Phát'}
            </button>
            <button
              className="btn-secondary dict-audio-btn"
              type="button"
              onClick={() => play(current, true)}
            >
              <Repeat size={16} /> Nghe lại
            </button>
            <span className="dict-replay-count">
              <Headphones size={14} /> Đã nghe lại {replays} lần
            </span>
          </div>
        </div>

        <div className="dict-input-row">
          <input
            ref={inputRef}
            type="text"
            className={`typing-input dict-input ${checked ? (correctNow ? 'input-correct' : 'input-incorrect') : ''}`}
            value={inputValue}
            onChange={event => setInputValue(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={checked ? 'Nhấn Enter để sang phần tiếp theo...' : 'Gõ chữ Hán vừa nghe...'}
            readOnly={checked}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            lang="zh"
          />
          {!checked && (
            <button
              className="btn-primary btn-submit-ans"
              type="button"
              onClick={submit}
              disabled={!inputValue.trim()}
            >
              Kiểm tra
            </button>
          )}
        </div>

        {checked && (
          <div className="dict-result slide-up">
            <div className="dict-verdict">
              {correctNow
                ? <span className="stamp-correct"><Check size={16} /> Viết đúng</span>
                : <span className="stamp-incorrect"><XCircle size={16} /> Chưa đúng</span>}
            </div>

            <div className="dict-diff" aria-label="So sánh từng chữ">
              {diff.map(cell => (
                <span key={cell.key} className={`dict-diff-cell dict-diff-${cell.status}`}>
                  <span className="dict-diff-char" lang="zh">{cell.want || cell.got}</span>
                  <span className="dict-diff-mark" aria-hidden="true">{DIFF_MARK[cell.status]}</span>
                  <span className="sr-only">{DIFF_LABEL[cell.status]}</span>
                </span>
              ))}
            </div>

            <div className="dict-answer">
              <span className="eyebrow-label">Đáp án</span>
              <p className="dict-answer-cn"><ClickableChineseText text={current.text} /></p>
              {current.pinyin && <p className="dict-answer-py">{current.pinyin}</p>}
              {current.meaning && <p className="dict-answer-vi">{current.meaning}</p>}
            </div>
          </div>
        )}

        <div className="dict-nav">
          <button
            className="btn-secondary action-btn"
            type="button"
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
          >
            <ChevronLeft size={16} /> {mode === 'passage' ? 'Câu trước' : 'Trước'}
          </button>
          <button className="btn-primary action-btn next-btn" type="button" onClick={checked ? next : submit}>
            {checked
              ? <>{index + 1 < items.length ? (mode === 'passage' ? 'Câu sau' : 'Tiếp') : 'Xem kết quả'} <ChevronRight size={16} /></>
              : 'Kiểm tra (Enter)'}
          </button>
        </div>
      </section>
    </main>
  );
}