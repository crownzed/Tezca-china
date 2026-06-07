import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Volume2, RefreshCw, CheckCircle2, XCircle, Lightbulb, ArrowRight, MessageCircle } from 'lucide-react';

/* ─── 20 tình huống hội thoại thực tế ─── */
const CONVERSATIONS = [
  {
    id: 1,
    topic: '👋 Chào hỏi',
    situation: 'Bạn gặp một người bạn Trung Quốc lần đầu. Hãy tự giới thiệu: nói tên bạn, bạn là người Việt Nam, và rất vui được gặp họ.',
    prompt: 'Hãy viết câu chào + tự giới thiệu bằng tiếng Trung:',
    keywords: ['你好', '我叫', '越南', '认识', '高兴'],
    reference: '你好！我叫[名字]，我是越南人。很高兴认识你！',
    tips: 'Dùng 你好 (nǐ hǎo) để chào, 我叫 (wǒ jiào) + tên, 很高兴认识你 (hěn gāoxìng rènshi nǐ) = rất vui được biết bạn.'
  },
  {
    id: 2,
    topic: '☕ Hỏi thăm',
    situation: 'Bạn gặp lại một người bạn cũ. Hãy hỏi thăm: dạo này thế nào, đang làm gì, và rủ đi uống cà phê.',
    prompt: 'Viết câu hỏi thăm bằng tiếng Trung:',
    keywords: ['最近', '怎么样', '忙', '咖啡', '一起'],
    reference: '最近怎么样？忙不忙？我们一起喝咖啡吧！',
    tips: '最近怎么样 (zuìjìn zěnmeyàng) = dạo này thế nào. 一起 (yīqǐ) = cùng nhau.'
  },
  {
    id: 3,
    topic: '🍜 Gọi món',
    situation: 'Bạn vào một quán mì ở Trung Quốc. Hãy gọi một tô mì bò, nói không cần rau mùi, và hỏi giá.',
    prompt: 'Viết câu gọi món:',
    keywords: ['牛肉面', '不要', '香菜', '多少', '钱'],
    reference: '你好，我要一碗牛肉面，不要香菜。多少钱？',
    tips: '牛肉面 (niúròu miàn) = mì bò. 不要香菜 (bù yào xiāngcài) = không cần rau mùi.'
  },
  {
    id: 4,
    topic: '🚕 Bắt taxi',
    situation: 'Bạn đang đứng trên đường ở Bắc Kinh và cần bắt taxi đến sân bay. Hãy nói với tài xế điểm đến và hỏi giá.',
    prompt: 'Viết câu nói với tài xế:',
    keywords: ['师傅', '机场', '多少', '钱', '走'],
    reference: '师傅，我去机场。多少钱？可以走了吗？',
    tips: '师傅 (shīfu) = bác tài (cách gọi tài xế lịch sự). 机场 (jīchǎng) = sân bay.'
  },
  {
    id: 5,
    topic: '🏪 Mua sắm',
    situation: 'Bạn vào một cửa hàng quần áo. Hãy hỏi: áo này có size M không, màu đen có không, và bao nhiêu tiền.',
    prompt: 'Viết câu hỏi bằng tiếng Trung:',
    keywords: ['这件', 'M码', '黑色', '多少', '钱'],
    reference: '你好，这件衣服有M码吗？有黑色的吗？多少钱？',
    tips: '这件 (zhè jiàn) = cái này. 码 (mǎ) = size. 黑色 (hēisè) = màu đen.'
  },
  {
    id: 6,
    topic: '🏥 Khám bệnh',
    situation: 'Bạn bị đau đầu và sốt. Hãy nói với bác sĩ triệu chứng của bạn: đau đầu, hơi sốt, được mấy ngày rồi.',
    prompt: 'Viết câu mô tả triệu chứng:',
    keywords: ['头疼', '发烧', '两天', '不舒服', '医生'],
    reference: '医生，我头疼，有一点发烧。两天了，很不舒服。',
    tips: '头疼 (tóuténg) = đau đầu. 发烧 (fāshāo) = sốt. 两天 (liǎng tiān) = hai ngày.'
  },
  {
    id: 7,
    topic: '📱 Mua điện thoại',
    situation: 'Bạn muốn mua một cái điện thoại mới ở cửa hàng. Hãy hỏi: giá bao nhiêu, có bảo hành không, màu gì.',
    prompt: 'Viết câu hỏi mua điện thoại:',
    keywords: ['手机', '多少', '钱', '保修', '颜色'],
    reference: '这个手机多少钱？有保修吗？有什么颜色？',
    tips: '手机 (shǒujī) = điện thoại. 保修 (bǎoxiū) = bảo hành. 颜色 (yánsè) = màu sắc.'
  },
  {
    id: 8,
    topic: '🎂 Sinh nhật',
    situation: 'Hôm nay là sinh nhật bạn của bạn. Hãy chúc mừng sinh nhật họ, chúc họ vui vẻ, và nói rằng bạn có quà.',
    prompt: 'Viết câu chúc mừng sinh nhật:',
    keywords: ['生日快乐', '开心', '礼物', '今天', '祝你'],
    reference: '生日快乐！祝你天天开心！这是给你的礼物。',
    tips: '生日快乐 (shēngrì kuàilè) = chúc mừng sinh nhật. 礼物 (lǐwù) = quà tặng.'
  },
  {
    id: 9,
    topic: '🌤️ Thời tiết',
    situation: 'Bạn nói chuyện với bạn về thời tiết hôm nay. Hãy nói: hôm nay nóng quá, muốn đi bơi hoặc ở nhà bật điều hòa.',
    prompt: 'Viết câu về thời tiết:',
    keywords: ['今天', '热', '游泳', '空调', '在家'],
    reference: '今天太热了！我想去游泳，或者在家开空调。',
    tips: '太热了 (tài rè le) = nóng quá. 游泳 (yóuyǒng) = bơi. 空调 (kōngtiáo) = điều hòa.'
  },
  {
    id: 10,
    topic: '🎓 Học tập',
    situation: 'Bạn nói với bạn học: bạn đang học tiếng Trung, thấy hơi khó nhưng rất thú vị, và muốn luyện tập nhiều hơn.',
    prompt: 'Viết câu về việc học:',
    keywords: ['学习', '中文', '难', '有意思', '练习'],
    reference: '我在学习中文。中文有点难但是很有意思。我想多练习。',
    tips: '学习 (xuéxí) = học tập. 难 (nán) = khó. 有意思 (yǒu yìsi) = thú vị. 练习 (liànxí) = luyện tập.'
  },
  {
    id: 11,
    topic: '✈️ Du lịch',
    situation: 'Bạn sắp đi du lịch Trung Quốc. Hãy hỏi bạn: đã từng đi chưa, có gợi ý địa điểm nào không, muốn đi cùng không.',
    prompt: 'Viết câu hỏi về du lịch:',
    keywords: ['旅游', '去过', '推荐', '地方', '一起'],
    reference: '我打算去中国旅游。你有什么地方推荐吗？一起去吧！',
    tips: '旅游 (lǚyóu) = du lịch. 去过 (qù guò) = đã từng đi. 推荐 (tuījiàn) = gợi ý.'
  },
  {
    id: 12,
    topic: '🍵 Mời trà',
    situation: 'Bạn được mời đến nhà bạn người Trung Quốc. Hãy khen trà ngon, hỏi đó là trà gì, và cảm ơn chủ nhà.',
    prompt: 'Viết câu khen trà:',
    keywords: ['茶', '好喝', '什么茶', '谢谢', '阿姨'],
    reference: '这茶真好喝！请问是什么茶？谢谢阿姨！',
    tips: '好喝 (hǎohē) = ngon (đồ uống). 阿姨 (āyí) = cô/dì (cách gọi phụ nữ lớn tuổi).'
  },
  {
    id: 13,
    topic: '🎬 Rủ đi xem phim',
    situation: 'Bạn rủ bạn đi xem phim cuối tuần. Hỏi: cuối tuần có rảnh không, muốn xem phim gì, giờ chiếu nào.',
    prompt: 'Viết câu rủ đi xem phim:',
    keywords: ['周末', '有空', '看电影', '想看', '几点'],
    reference: '周末你有空吗？我们一起去看电影吧！你想看什么？几点的？',
    tips: '有空 (yǒu kòng) = có rảnh. 看电影 (kàn diànyǐng) = xem phim.'
  },
  {
    id: 14,
    topic: '📦 Nhận hàng',
    situation: 'Bạn nhận được bưu kiện từ Taobao. Hãy nói: cảm ơn, kiểm tra hàng, thấy ổn, và hỏi có phiếu bảo hành không.',
    prompt: 'Viết câu khi nhận hàng:',
    keywords: ['快递', '谢谢', '检查', '没问题', '保修'],
    reference: '谢谢！我检查一下快递。没问题，有保修卡吗？',
    tips: '快递 (kuàidì) = chuyển phát nhanh. 检查 (jiǎnchá) = kiểm tra. 保修卡 (bǎoxiū kǎ) = thẻ bảo hành.'
  },
  {
    id: 15,
    topic: '💼 Xin việc',
    situation: 'Bạn đi phỏng vấn xin việc. Hãy nói: tên bạn, tốt nghiệp ngành gì, có kinh nghiệm không, và mong muốn được làm việc.',
    prompt: 'Viết câu giới thiệu khi phỏng vấn:',
    keywords: ['毕业', '专业', '经验', '工作', '希望'],
    reference: '我毕业于...专业，有...经验。希望有机会在这里工作。',
    tips: '毕业 (bìyè) = tốt nghiệp. 专业 (zhuānyè) = chuyên ngành. 经验 (jīngyàn) = kinh nghiệm.'
  },
  {
    id: 16,
    topic: '🏠 Hỏi đường',
    situation: 'Bạn đi lạc trên đường phố Bắc Kinh. Hãy hỏi người đi đường: nhà vệ sinh ở đâu, đi thẳng hay rẽ, bao xa.',
    prompt: 'Viết câu hỏi đường:',
    keywords: ['请问', '厕所在哪', '怎么走', '直走', '拐'],
    reference: '请问，厕所在哪？怎么走？直走还是拐弯？',
    tips: '厕所在哪 (cèsuǒ zài nǎ) = nhà vệ sinh ở đâu. 怎么走 (zěnme zǒu) = đi thế nào. 拐 (guǎi) = rẽ.'
  },
  {
    id: 17,
    topic: '💳 Thanh toán',
    situation: 'Bạn đi siêu thị mua đồ. Hãy nói: tính tiền, hỏi tổng bao nhiêu, có thể quét mã WeChat không, xin túi.',
    prompt: 'Viết câu ở quầy thanh toán:',
    keywords: ['结账', '一共', '多少', '扫码', '袋子'],
    reference: '我要结账。一共多少钱？可以扫码支付吗？我要一个袋子。',
    tips: '结账 (jiézhàng) = tính tiền. 一共 (yīgòng) = tổng cộng. 扫码 (sǎo mǎ) = quét mã.'
  },
  {
    id: 18,
    topic: '🎵 Sở thích',
    situation: 'Bạn nói với bạn về sở thích: bạn thích nghe nhạc Trung Quốc, có biết ca sĩ nào không, giới thiệu vài bài.',
    prompt: 'Viết câu về sở thích:',
    keywords: ['喜欢', '听', '中国', '音乐', '歌手'],
    reference: '我喜欢听中国音乐。你知道哪些中国歌手？可以推荐一些吗？',
    tips: '音乐 (yīnyuè) = âm nhạc. 歌手 (gēshǒu) = ca sĩ. 推荐 (tuījiàn) = giới thiệu.'
  },
  {
    id: 19,
    topic: '🥟 Nấu ăn',
    situation: 'Bạn học nấu món Trung Quốc. Hãy hỏi bạn: món này làm thế nào, cần nguyên liệu gì, nấu bao lâu.',
    prompt: 'Viết câu hỏi về nấu ăn:',
    keywords: ['怎么做', '需要', '材料', '分钟', '好吃'],
    reference: '这个菜怎么做？需要什么材料？煮几分钟才好吃？',
    tips: '怎么做 (zěnme zuò) = làm thế nào. 材料 (cáiliào) = nguyên liệu. 分钟 (fēnzhōng) = phút.'
  },
  {
    id: 20,
    topic: '🎉 Tạm biệt',
    situation: 'Bạn kết thúc buổi gặp mặt với bạn Trung Quốc. Hãy nói: cảm ơn vì hôm nay, hy vọng gặp lại, chúc ngủ ngon.',
    prompt: 'Viết câu tạm biệt:',
    keywords: ['今天', '谢谢', '希望', '下次', '晚安'],
    reference: '今天很开心，谢谢！希望下次再见面。晚安！',
    tips: '希望 (xīwàng) = hy vọng. 下次 (xià cì) = lần sau. 晚安 (wǎnān) = chúc ngủ ngon.'
  }
];

/* ─── Helper: kiểm tra từ khoá trong câu trả lời ─── */
function countKeywords(input, keywords) {
  return keywords.filter(kw => input.includes(kw)).length;
}

function getGrade(inp, keywords) {
  const matched = countKeywords(inp, keywords);
  const total = keywords.length;
  if (matched === 0) return { score: 0, label: 'Chưa đúng', color: '#ef4444' };
  if (matched <= total * 0.33) return { score: 1, label: 'Cần cố gắng', color: '#f97316' };
  if (matched <= total * 0.66) return { score: 2, label: 'Tạm được', color: '#fbbf24' };
  if (matched < total) return { score: 3, label: 'Khá tốt!', color: '#22c55e' };
  return { score: 4, label: 'Xuất sắc! 🎉', color: '#22c55e' };
}

export default function FreeChat() {
  const [convIdx, setConvIdx] = useState(0);
  const [input, setInput] = useState('');
  const [logs, setLogs] = useState([]);
  const [grade, setGrade] = useState(null);
  const [showRef, setShowRef] = useState(false);
  const [finished, setFinished] = useState(false);
  const [score, setScore] = useState(0);
  const inputRef = useRef(null);

  const conv = CONVERSATIONS[convIdx];

  const handleSubmit = () => {
    if (!input.trim()) return;
    const result = getGrade(input.trim(), conv.keywords);
    setGrade(result);
    setLogs(prev => [...prev, { user: input.trim(), grade: result, ref: conv.reference }]);
    setShowRef(true);
    setScore(s => s + result.score);
  };

  const handleNext = () => {
    if (convIdx + 1 >= CONVERSATIONS.length) {
      setFinished(true);
    } else {
      setConvIdx(i => i + 1);
      setInput('');
      setGrade(null);
      setShowRef(false);
      inputRef.current?.focus();
    }
  };

  const speakText = (text) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN';
      u.rate = 0.85;
      window.speechSynthesis.speak(u);
    }
  };

  const resetAll = () => {
    setConvIdx(0);
    setInput('');
    setLogs([]);
    setGrade(null);
    setShowRef(false);
    setFinished(false);
    setScore(0);
  };

  if (finished) {
    const maxScore = CONVERSATIONS.length * 4;
    const pct = Math.round((score / maxScore) * 100);
    return (
      <div style={{ maxWidth: 550, margin: '0 auto', textAlign: 'center' }} className="animate-bounce-in">
        <MessageCircle size={64} style={{ color: 'var(--accent-2)', marginBottom: 12 }} />
        <h2 style={{ marginBottom: 8 }}>Luyện tập hoàn tất! 🎉</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>Đã hoàn thành {CONVERSATIONS.length} tình huống</p>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginBottom: 24 }}>
          <div className="stat-card"><div className="stat-value" style={{ color: '#22c55e' }}>{score}/{maxScore}</div><div className="stat-label">Điểm</div></div>
          <div className="stat-card"><div className="stat-value" style={{ color: 'var(--accent-2)' }}>{pct}%</div><div className="stat-label">Hiệu quả</div></div>
        </div>
        <div className="glass-panel" style={{ padding: 16, marginBottom: 20, textAlign: 'left', maxHeight: 200, overflowY: 'auto' }}>
          {logs.map((log, i) => (
            <div key={i} style={{ marginBottom: 8, padding: 8, background: 'rgba(91,106,191,0.04)', borderRadius: 6, fontSize: '0.85rem' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>#{i + 1}:</span>{' '}
              <span className="cn-text">{log.user}</span>
              <span style={{ float: 'right', color: log.grade.color, fontWeight: 600 }}>{log.grade.label}</span>
            </div>
          ))}
        </div>
        <button className="btn-primary" onClick={resetAll} style={{ fontSize: '1rem', padding: '12px 28px' }}>
          <RefreshCw size={18} /> Luyện lại
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      {/* Progress + score */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{convIdx + 1}/{CONVERSATIONS.length}</span>
        <div className="progress-bar-container" style={{ flex: 1, margin: '0 12px' }}>
          <div className="progress-bar-fill" style={{ width: `${((convIdx) / CONVERSATIONS.length) * 100}%` }} />
        </div>
        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent-2)' }}>{score}đ</span>
      </div>

      {/* Conversation card */}
      <div className="glass-panel" style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>{conv.topic}</div>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 16 }}>{conv.situation}</p>
        <div style={{
          background: 'rgba(79,195,247,0.08)', borderLeft: '3px solid var(--accent-2)',
          padding: '12px 16px', borderRadius: '0 var(--radius-sm) var(--radius-sm) 0'
        }}>
          <p style={{ color: 'var(--accent-2)', fontWeight: 600, marginBottom: 4, fontSize: '0.9rem' }}>{conv.prompt}</p>
        </div>
      </div>

      {/* Input area */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !grade) handleSubmit(); }}
          placeholder="Gõ câu tiếng Trung của bạn tại đây..."
          disabled={!!grade}
          className="freechat-input"
          autoFocus
        />
        {!grade ? (
          <button className="btn-primary" onClick={handleSubmit} disabled={!input.trim()} style={{ padding: '10px 18px' }}>
            <Send size={18} />
          </button>
        ) : null}
      </div>

      {/* Feedback */}
      {grade && (
        <div className="animate-slide-up" style={{ marginBottom: 16 }}>
          <div className="glass-panel" style={{ padding: 16, borderLeft: `3px solid ${grade.color}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              {grade.score >= 3 ? <CheckCircle2 size={20} color="#22c55e" /> : <XCircle size={20} color={grade.color} />}
              <span style={{ color: grade.color, fontWeight: 700, fontSize: '1rem' }}>{grade.label}</span>
              <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {countKeywords(input, conv.keywords)}/{conv.keywords.length} từ khoá
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {conv.keywords.map(kw => (
                <span key={kw} className={`tag ${input.includes(kw) ? 'tag-primary' : 'tag-danger'}`}>
                  {input.includes(kw) ? '✅' : '◻'} {kw}
                </span>
              ))}
            </div>

            {showRef && (
              <div className="animate-slide-up" style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--glass-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>📝 Câu tham khảo:</span>
                  <button className="btn-secondary" onClick={() => speakText(conv.reference.split('。')[0])} style={{ padding: '3px 10px', fontSize: '0.75rem' }}>
                    <Volume2 size={12} /> Đọc
                  </button>
                </div>
                <div style={{ fontSize: '1rem', color: 'var(--accent-2)', fontWeight: 600, fontFamily: 'Noto Sans SC, sans-serif' }}>
                  {conv.reference}
                </div>
              </div>
            )}

            {showRef && (
              <div style={{ marginTop: 8 }}>
                <button className="btn-primary" onClick={handleNext} style={{ width: '100%', justifyContent: 'center' }}>
                  {convIdx + 1 < CONVERSATIONS.length ? 'Tình huống tiếp theo' : 'Xem kết quả'} <ArrowRight size={16} />
                </button>
              </div>
            )}
          </div>

          {/* Tips */}
          {!showRef && (
            <div style={{ marginTop: 8, textAlign: 'center' }}>
              <button className="btn-secondary" onClick={() => setShowRef(true)} style={{ fontSize: '0.85rem' }}>
                <Lightbulb size={14} /> Xem gợi ý và câu mẫu
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
