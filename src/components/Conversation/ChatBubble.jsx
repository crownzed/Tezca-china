import { useState } from 'react';
import { Volume2 } from 'lucide-react';
import { isHanzi, lookupHanzi } from './hanzi-lookup.js';

// Bong bóng chat tái dùng. role: 'ai' | 'user' -> tự căn lề + màu nền.
// - AI: trái, có nút loa nghe lại + tooltip pinyin/nghĩa khi chạm từng chữ Hán.
// - User: phải, hiển thị câu người dùng vừa nói.

function HanziText({ text }) {
  const [active, setActive] = useState(null); // index chữ đang mở tooltip
  return (
    <span className="chat-cn">
      {Array.from(String(text)).map((char, i) => {
        if (!isHanzi(char)) return <span key={i}>{char}</span>;
        const info = lookupHanzi(char);
        if (!info) return <span key={i}>{char}</span>;
        const open = active === i;
        return (
          <span
            key={i}
            className={`hanzi-tip${open ? ' is-open' : ''}`}
            tabIndex={0}
            role="button"
            aria-label={`${char} — ${info.pinyin}: ${info.meaning}`}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive((cur) => (cur === i ? null : cur))}
            onFocus={() => setActive(i)}
            onBlur={() => setActive((cur) => (cur === i ? null : cur))}
            onClick={() => setActive((cur) => (cur === i ? null : i))}
          >
            {char}
            {open && (
              <span className="hanzi-pop" role="tooltip">
                <strong>{info.pinyin}</strong>
                <small>{info.meaning}</small>
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

export default function ChatBubble({ role, cn, vi, onReplay, enableTooltip = false }) {
  const isAi = role === 'ai' || role === 'model';
  return (
    <div className={`chat-row chat-row--${isAi ? 'ai' : 'user'}`}>
      <div className={`chat-bubble2 chat-bubble2--${isAi ? 'ai' : 'user'}`}>
        {isAi && enableTooltip ? <HanziText text={cn} /> : <span className="chat-cn">{cn}</span>}
        {vi && <span className="chat-vi">{vi}</span>}
      </div>
      {isAi && cn && onReplay && (
        <button type="button" className="chat-replay" onClick={onReplay} title="Nghe lại" aria-label="Nghe lại">
          <Volume2 size={15} />
        </button>
      )}
    </div>
  );
}
