import { useState, useTransition } from 'react';
import { Bot, Check, Copy, Eye, EyeOff, Lightbulb, Mic, Sparkles, User, Volume2 } from 'lucide-react';
import { isHanzi, lookupHanzi } from './hanzi-lookup.js';

// Hiển thị chữ Hán song song với Pinyin (nếu bật) và tooltip tra nghĩa từng chữ
function HanziText({ text, showPinyin = true, enableTooltip = true }) {
  const [active, setActive] = useState(null);

  const chars = Array.from(String(text || ''));

  return (
    <div className="cv-chinese-block">
      {chars.map((char, i) => {
        if (!isHanzi(char)) {
          return (
            <span key={i} className="cv-hanzi-punct">
              {char}
            </span>
          );
        }

        const info = enableTooltip ? lookupHanzi(char) : null;
        const open = active === i;

        return (
          <span
            key={i}
            className="cv-hanzi-unit"
            tabIndex={0}
            role="button"
            aria-label={info ? `${char}: ${info.pinyin}: ${info.meaning}` : char}
            onMouseEnter={() => enableTooltip && setActive(i)}
            onMouseLeave={() => enableTooltip && setActive((cur) => (cur === i ? null : cur))}
            onFocus={() => enableTooltip && setActive(i)}
            onBlur={() => enableTooltip && setActive((cur) => (cur === i ? null : cur))}
            onClick={() => enableTooltip && setActive((cur) => (cur === i ? null : i))}
          >
            {showPinyin && (
              <span className="cv-pinyin-label">
                {info?.pinyin || '\u00A0'}
              </span>
            )}
            <span className="cv-hanzi-char">{char}</span>

            {open && info && (
              <span className="cv-hanzi-pop" role="tooltip">
                <strong>{info.pinyin}</strong>
                <small>{info.meaning || 'Chữ Hán'}</small>
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

// Sinh gợi ý câu trả lời mẫu dựa trên câu của AI
function getSmartReplyHints(cnText) {
  const text = String(cnText || '');
  if (text.includes('吗') || text.includes('？') || text.includes('?')) {
    if (text.includes('想') || text.includes('要') || text.includes('喜欢')) {
      return [
        { cn: '我很喜欢，你呢？', vi: 'Tôi rất thích, còn bạn?' },
        { cn: '我想考虑一下。', vi: 'Tôi muốn suy nghĩ thêm một chút.' },
      ];
    }
    if (text.includes('吃') || text.includes('喝')) {
      return [
        { cn: '好的，我们一起去吧！', vi: 'Được chứ, chúng ta cùng đi nhé!' },
        { cn: '我已经吃饱了，谢谢。', vi: 'Tôi đã ăn no rồi, cảm ơn.' },
      ];
    }
    return [
      { cn: '是的，我觉得很好。', vi: 'Đúng vậy, tôi thấy rất tốt.' },
      { cn: '不是，我有不同的看法。', vi: 'Không phải, tôi có ý kiến khác.' },
      { cn: '好的，我知道了。', vi: 'Được rồi, tôi biết rồi.' },
    ];
  }
  return [
    { cn: '太好了！你能多讲讲吗？', vi: 'Tuyệt quá! Bạn nói thêm được không?' },
    { cn: '请用汉语问我一个问题。', vi: 'Hãy dùng tiếng Trung hỏi tôi 1 câu.' },
    { cn: '谢谢你的耐心指导！', vi: 'Cảm ơn bạn đã kiên nhẫn hướng dẫn!' },
  ];
}

export default function ChatBubble({
  role,
  cn,
  vi,
  isVoice = false,
  showPinyin = true,
  showViGlobal = true,
  isPlaying = false,
  playingSpeed = 1,
  onReplay,
  onReplaySlow,
  onSelectHint,
  enableTooltip = true,
}) {
  const isAi = role === 'ai' || role === 'model';
  const [copied, setCopied] = useState(false);
  const [showViLocal, setShowViLocal] = useState(true);
  const [showHints, setShowHints] = useState(false);

  const handleCopy = async () => {
    if (!cn) return;
    try {
      await navigator.clipboard.writeText(cn);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const isViVisible = showViGlobal && showViLocal;
  const replyHints = isAi && cn ? getSmartReplyHints(cn) : [];

  return (
    <div className={`cv-row cv-row--${isAi ? 'ai' : 'user'}`}>
      {isAi && (
        <div className="cv-msg-avatar" aria-hidden="true">
          <Bot size={18} />
        </div>
      )}

      <div className="cv-msg-body">
        {isAi ? (
          <div className="cv-bubble-ai">
            {/* Chữ Hán & Pinyin */}
            <HanziText text={cn} showPinyin={showPinyin} enableTooltip={enableTooltip} />

            {/* Dịch nghĩa tiếng Việt */}
            {vi && isViVisible && (
              <div className="cv-translation-box">
                <span className="cv-translation-icon" aria-hidden="true">
                  <Sparkles size={14} />
                </span>
                <span>{vi}</span>
              </div>
            )}

            {/* Thanh thao tác nhanh cho tin nhắn AI */}
            <div className="cv-msg-actions">
              {onReplay && (
                <button
                  type="button"
                  className={`cv-action-pill${isPlaying && playingSpeed >= 0.8 ? ' is-active' : ''}`}
                  onClick={() => onReplay(cn, 0.82)}
                  title="Nghe phát âm chuẩn (1.0x)"
                  aria-label="Nghe phát âm chuẩn"
                >
                  {isPlaying && playingSpeed >= 0.8 ? (
                    <span className="cv-playing-wave">
                      <span /><span /><span />
                    </span>
                  ) : (
                    <Volume2 size={13} />
                  )}
                  <span>Phát âm</span>
                </button>
              )}

              {onReplaySlow && (
                <button
                  type="button"
                  className={`cv-action-pill${isPlaying && playingSpeed < 0.8 ? ' is-active' : ''}`}
                  onClick={() => onReplaySlow(cn, 0.72)}
                  title="Nghe chậm (0.75x) để luyện bắt âm"
                  aria-label="Nghe chậm 0.75x"
                >
                  <span>🐢 Chậm</span>
                </button>
              )}

              {vi && (
                <button
                  type="button"
                  className="cv-action-pill"
                  onClick={() => setShowViLocal((prev) => !prev)}
                  title={isViVisible ? 'Ẩn bản dịch tiếng Việt' : 'Hiện bản dịch tiếng Việt'}
                  aria-label="Ẩn hiện bản dịch"
                >
                  {isViVisible ? <EyeOff size={13} /> : <Eye size={13} />}
                  <span>{isViVisible ? 'Ẩn dịch' : 'Dịch'}</span>
                </button>
              )}

              <button
                type="button"
                className="cv-action-pill"
                onClick={handleCopy}
                title="Sao chép chữ Hán"
                aria-label="Sao chép chữ Hán"
              >
                {copied ? <Check size={13} color="#10B981" /> : <Copy size={13} />}
                <span>{copied ? 'Đã chép' : 'Chép'}</span>
              </button>

              {onSelectHint && replyHints.length > 0 && (
                <button
                  type="button"
                  className={`cv-action-pill${showHints ? ' is-active' : ''}`}
                  onClick={() => setShowHints((prev) => !prev)}
                  title="Gợi ý câu trả lời tiếp theo"
                  aria-label="Gợi ý câu trả lời"
                >
                  <Lightbulb size={13} />
                  <span>Gợi ý trả lời</span>
                </button>
              )}
            </div>

            {/* Khung gợi ý câu trả lời tiếp theo */}
            {showHints && replyHints.length > 0 && (
              <div className="cv-reply-hints">
                <div className="cv-reply-hints-title">
                  <Lightbulb size={12} />
                  <span>Bạn có thể đáp lại:</span>
                </div>
                <div className="cv-reply-hints-list">
                  {replyHints.map((hint, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="cv-reply-hint-chip"
                      onClick={() => {
                        onSelectHint(hint.cn);
                        setShowHints(false);
                      }}
                      title={hint.vi}
                    >
                      <span>{hint.cn}</span>
                      <small style={{ opacity: 0.65, fontSize: '0.74rem' }}>({hint.vi})</small>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="cv-bubble-user">
            <div className="cv-hanzi-text">{cn}</div>
            {isVoice && (
              <div className="cv-bubble-user-voice-badge">
                <Mic size={11} />
                <span>Giọng nói</span>
              </div>
            )}
          </div>
        )}
      </div>

      {!isAi && (
        <div className="cv-msg-avatar" aria-hidden="true">
          <User size={17} />
        </div>
      )}
    </div>
  );
}
