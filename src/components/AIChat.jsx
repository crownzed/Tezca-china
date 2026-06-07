import React, { useState, useRef, useEffect } from 'react';
import { Send, Volume2, RefreshCw, Smile } from 'lucide-react';
import { processMessage, createContext, KB_COUNT } from '../ai-chat-engine';

export default function AIChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const chatRef = useRef(null);
  const inputRef = useRef(null);
  const ctxRef = useRef(createContext());

  useEffect(() => {
    if (messages.length === 0) {
      const greet = pick([
        '你好！我是小AI 🤖 你的中文学习伙伴！我们可以用中文聊天，你想聊什么？',
        '你好！终于有人来找我聊天了！你叫什么名字？😊',
        '嗨！今天心情好吗？我们可以一起练习中文！'
      ]);
      setMessages([{ role: 'bot', text: greet }]);
    }
  }, []);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, thinking]);

  const speakText = (text) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/[😊😄🤖💪🎉🌟👋🙏💕]/g, ''));
      u.lang = 'zh-CN';
      u.rate = 0.85;
      window.speechSynthesis.speak(u);
    }
  };

  const handleSend = async () => {
    const txt = input.trim();
    if (!txt || thinking) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: txt }]);
    setThinking(true);

    // Delay tự nhiên
    await new Promise(r => setTimeout(r, 500 + Math.random() * 600));

    const reply = await processMessage(txt, ctxRef.current);
    setMessages(prev => [...prev, { role: 'bot', text: reply }]);
    setThinking(false);
  };

  const resetChat = () => {
    ctxRef.current = createContext();
    setMessages([]);
    setThinking(false);
    setTimeout(() => {
      setMessages([{ role: 'bot', text: '你好！我们又见面了！这次想聊什么呢？😊' }]);
    }, 100);
  };

  const quickReplies = [
    { label: '👋 Chào hỏi', text: '你好！' },
    { label: '🎓 Học tập', text: '我在学中文。' },
    { label: '🍜 Ẩm thực', text: '我喜欢中国菜！' },
    { label: '✈️ Du lịch', text: '我想去北京旅游。' },
    { label: '🐼 Động vật', text: '我喜欢熊猫！' },
    { label: '🎵 Sở thích', text: '我喜欢听音乐。' },
    { label: '🇻🇳 Quê hương', text: '我是越南人。' },
    { label: '👋 Tạm biệt', text: '再见！' },
  ];

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      {/* Header */}
      <div className="glass-panel" style={{ padding: '12px 16px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--gradient-hero)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>🤖</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
              小AI · <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{KB_COUNT} chủ đề</span>
            </div>
            <div style={{ fontSize: '0.7rem', color: '#22c55e' }}>● Đang trực tuyến</div>
          </div>
        </div>
        <button className="btn-secondary" onClick={resetChat} title="Làm mới" style={{ padding: '6px 10px' }}>
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Chat box */}
      <div className="aichat-container" ref={chatRef} style={{ height: 440 }}>
        {messages.map((msg, idx) => (
          <div key={idx} className={`aichat-row ${msg.role}`}>
            <div className="aichat-avatar">{msg.role === 'bot' ? '🤖' : '👤'}</div>
            <div className={`aichat-bubble ${msg.role}`}>
              <div className="cn-text">{msg.text}</div>
              {msg.role === 'bot' && (
                <button className="aichat-speak-btn" onClick={() => speakText(msg.text)} title="Phát âm">
                  <Volume2 size={12} />
                </button>
              )}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="aichat-row bot">
            <div className="aichat-avatar">🤖</div>
            <div className="aichat-bubble bot">
              <div className="typing-dots"><span /><span /><span /></div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="aichat-input-bar">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
          placeholder="Nhập tiếng Trung hoặc tiếng Việt..."
          className="aichat-input"
          disabled={thinking}
        />
        <button className="btn-primary" onClick={handleSend} disabled={!input.trim() || thinking} style={{ padding: '10px 16px' }}>
          <Send size={18} />
        </button>
      </div>

      {/* Quick chips */}
      <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {quickReplies.map((qr, i) => (
          <span key={i} className="aichat-chip" onClick={() => { setInput(qr.text); inputRef.current?.focus(); }}>
            {qr.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
