import { useEffect, useRef, useState } from 'react';
import {
  Award, BarChart3, Blocks, BookOpen, CheckCircle2, Headphones, Languages,
  LineChart, LogIn, Mic, Moon, PenTool, Play, RefreshCw, ScrollText, Sparkles,
  Sun, UserPlus, WifiOff,
} from 'lucide-react';
import { applyTheme, getInitialTheme } from '../theme.js';
import SpaceVortexBackground from './SpaceVortexBackground.jsx';

// ============================================================
// LANDING PAGE — trang giới thiệu công khai (chưa đăng nhập).
//
// Mọi con số ở đây phải khớp dữ liệu THẬT trong repo, không phóng đại:
//   6 dạng bài      -> QUIZ_TYPES trong App.jsx
//   HSK 1-6         -> LEVELS trong App.jsx
//   35 cấu trúc NP  -> allGrammarSpecs (grammar-specs/index.js)
//   9.140 file audio-> public/audio/index.json
//   850 từ curated  -> data.js + vocab-bank.js (đã khử trùng)
//   233 bộ thủ      -> RADICALS_DICT (radicals-db.js)
// Khi dữ liệu đổi, sửa STATS bên dưới cho khớp.
// ============================================================

const STATS = [
  { value: '1–6', label: 'Cấp độ HSK', hint: 'Từ vựng, ngữ pháp và luyện tập trải đủ sáu cấp' },
  { value: '6', label: 'Dạng bài luyện', hint: 'Từ vựng, nghe, đọc, dịch, điền từ, sắp xếp câu' },
  { value: '35', label: 'Cấu trúc ngữ pháp', hint: 'Mỗi cấu trúc nở thành khoảng 100 câu hỏi' },
  { value: '9.140', label: 'File phát âm sẵn', hint: 'Giọng đọc dựng trước, nghe được cả khi offline' },
];

const FEATURES = [
  {
    icon: Play,
    tone: 'jade',
    title: 'Luyện tập thích ứng',
    body: 'Sáu dạng bài từ vựng, nghe, đọc hiểu, dịch đoạn, điền từ và sắp xếp câu. Thuật toán chọn câu dựa trên lịch sử làm bài: ưu tiên từ mới và từ bạn hay sai, tránh lặp lại câu vừa gặp.',
  },
  {
    icon: Mic,
    tone: 'cinnabar',
    title: 'Chẩn đoán phát âm hai lớp',
    body: 'Lớp định danh nhận diện chữ Hán và pinyin bạn vừa nói. Lớp âm học phân tích đường F0 rồi so khớp thanh điệu bằng Dynamic Time Warping, kèm chỉ số lưu loát và ngữ điệu.',
  },
  {
    icon: Blocks,
    tone: 'porcelain',
    title: 'Phòng thí nghiệm ngữ pháp',
    body: '35 cấu trúc HSK 1–6, mỗi cấu trúc có giải thích, ví dụ đối chiếu và nguồn tham chiếu. Engine sinh câu hỏi điền khuyết, chọn nghĩa, phán đoán đúng sai và sắp xếp trật tự.',
  },
  {
    icon: BookOpen,
    tone: 'gold',
    title: 'Từ vựng có chiều sâu',
    body: '850 từ biên soạn tay kèm câu ví dụ và mẹo nhớ, cùng 233 bộ thủ để tách nghĩa mặt chữ. Bảng luyện viết chạy theo từng nét, tự host dữ liệu nên không phụ thuộc CDN.',
  },
  {
    icon: LineChart,
    tone: 'jade',
    title: 'Ôn tập theo lịch SRS',
    body: 'Mỗi từ có lịch ôn riêng, giãn dần theo mức độ bạn tự đánh giá sau khi trả lời. Từ chưa chắc quay lại sớm, từ đã thuộc giãn ra xa để bạn không ôn lại thứ đã nhớ.',
  },
  {
    icon: BarChart3,
    tone: 'porcelain',
    title: 'Phân tích hành vi học',
    body: 'Biểu đồ xu hướng 8 phiên gần nhất, phân tích theo dạng bài và cấp độ, cùng bốn chỉ số trí nhớ bền, nghe, ngữ cảnh và sản sinh. AI đọc dữ liệu này để gợi ý bước kế tiếp.',
  },
];

// Từ cho thẻ "Phiên học hôm nay". TẤT CẢ lấy nguyên từ vocab-bank.js (chữ,
// pinyin, nghĩa, cấp HSK đúng như trong bank) — không tự bịa từ hay nghĩa.
// Cột cuối là số dòng trong vocab-bank.js để đối chiếu khi dữ liệu đổi.
const PREVIEW_WORDS = [
  { hanzi: '复习', pinyin: 'fùxí', meaning: 'Ôn tập', level: 3 },      // :518
  { hanzi: '练习', pinyin: 'liànxí', meaning: 'Luyện tập', level: 3 }, // :517
  { hanzi: '努力', pinyin: 'nǔlì', meaning: 'Cố gắng', level: 3 },     // :408
  { hanzi: '习惯', pinyin: 'xíguàn', meaning: 'Thói quen', level: 3 }, // :642
  { hanzi: '认真', pinyin: 'rènzhēn', meaning: 'Nghiêm túc', level: 3 }, // :409
  { hanzi: '提高', pinyin: 'tígāo', meaning: 'Nâng cao', level: 3 },   // :400
  { hanzi: '完成', pinyin: 'wánchéng', meaning: 'Hoàn thành', level: 3 }, // :405
  { hanzi: '简单', pinyin: 'jiǎndān', meaning: 'Đơn giản', level: 2 }, // :223
  { hanzi: '重要', pinyin: 'zhòngyào', meaning: 'Quan trọng', level: 2 }, // :222
  { hanzi: '发音', pinyin: 'fāyīn', meaning: 'Phát âm', level: 3 },    // :513
  { hanzi: '声调', pinyin: 'shēngdiào', meaning: 'Thanh điệu', level: 3 }, // :514
  { hanzi: '帮助', pinyin: 'bāngzhù', meaning: 'Giúp đỡ', level: 1 },  // :132
  { hanzi: '计划', pinyin: 'jìhuà', meaning: 'Kế hoạch', level: 4 },   // :813
  { hanzi: '决定', pinyin: 'juédìng', meaning: 'Quyết định', level: 3 }, // :391
];

// Dấu thanh -> số thanh. Suy ra từ chính pinyin thay vì chép tay số thanh vào
// bảng trên: bớt một chỗ có thể lệch khi ai đó sửa dữ liệu.
const TONE_MARKS = [
  'āēīōūǖ', // thanh 1
  'áéíóúǘ', // thanh 2
  'ǎěǐǒǔǚ', // thanh 3
  'àèìòùǜ', // thanh 4
];

// Quét TRỰC TIẾP các nguyên âm có dấu thanh, mỗi dấu = một âm tiết mang thanh.
// Không tách âm tiết theo phụ âm đầu: 'n' vừa là phụ âm đầu vừa là âm cuối, nên
// cách đó cắt 'bāngzhù' thành 'bā|ng|zhù' -> ra [1,5,4] thay vì [1,4]. Mọi từ
// trong PREVIEW_WORDS đều có dấu ở mỗi âm tiết, nên đếm dấu là đủ và đúng.
function toneNumbers(pinyin) {
  const tones = [];
  for (const char of pinyin) {
    const index = TONE_MARKS.findIndex(marks => marks.includes(char));
    if (index !== -1) tones.push(index + 1);
  }
  return tones;
}

// Số liệu minh hoạ, suy ra ổn định từ chính chữ Hán (cùng một từ luôn cho cùng
// một bộ số) nên thẻ không "nhảy số" ngẫu nhiên mỗi lần render lại.
function previewMetrics(hanzi) {
  const seed = [...hanzi].reduce((sum, char) => sum + char.codePointAt(0), 0);
  return {
    days: 2 + (seed % 5),
    bars: [
      { label: 'Trí nhớ bền', value: 62 + (seed % 33) },
      { label: 'Nghe', value: 48 + (seed % 41) },
      { label: 'Ngữ cảnh', value: 40 + (seed % 45) },
    ],
  };
}

const QUIZ_KINDS = [
  { icon: BookOpen, label: 'Từ vựng', hint: 'Nghĩa và chữ' },
  { icon: Headphones, label: 'Nghe', hint: 'Nghe câu chọn nghĩa' },
  { icon: ScrollText, label: 'Đọc hiểu', hint: 'Câu và ngữ cảnh' },
  { icon: Languages, label: 'Dịch đoạn', hint: 'Dịch đoạn nói' },
  { icon: ScrollText, label: 'Điền từ', hint: 'Chọn từ còn thiếu' },
  { icon: PenTool, label: 'Sắp xếp câu', hint: 'Ghép từ thành câu' },
];

const STEPS = [
  {
    title: 'Kiểm tra đầu vào',
    body: 'Một bài đánh giá ngắn trải các dạng bài để xác định cấp HSK phù hợp. Bỏ qua được nếu bạn đã biết trình độ của mình.',
  },
  {
    title: 'Học theo phiên hôm nay',
    body: 'Mỗi ngày có một phiên được dựng sẵn: giữ nhịp khi bạn bận, học sâu khi bạn rảnh, sửa lỗi khi chuỗi sai dài.',
  },
  {
    title: 'Đo lại và điều chỉnh',
    body: 'Kết quả từng câu cập nhật lịch ôn và bản đồ điểm yếu, nên phiên kế tiếp bám đúng chỗ bạn còn hụt.',
  },
];

const FAQ = [
  {
    q: 'Tezca có miễn phí không?',
    a: 'Có. Toàn bộ tính năng học đều dùng được sau khi tạo tài khoản, không có gói trả phí.',
  },
  {
    q: 'Không có mạng thì học được không?',
    a: 'Được. Từ vựng, quiz và phiên học chạy bằng dữ liệu cục bộ, tiến độ lưu tại trình duyệt rồi đồng bộ khi bạn kết nối lại. Giọng đọc cũng đã dựng sẵn thành file.',
  },
  {
    q: 'Vì sao cần đăng nhập?',
    a: 'Tài khoản giữ chuỗi ngày học, danh hiệu và lịch ôn của bạn trên mọi thiết bị. Nhiều người dùng chung một máy cũng không bị lẫn dữ liệu vì tiến độ cục bộ được tách theo từng tài khoản.',
  },
  {
    q: 'Phần chấm phát âm cần thiết bị gì?',
    a: 'Chỉ cần micro và trình duyệt cho phép ghi âm. Bản thu được phân tích để đối chiếu thanh điệu, không dùng cho mục đích nào khác.',
  },
];

// Thẻ "Phiên học hôm nay": mỗi lần tải trang bắt đầu ở một từ ngẫu nhiên, mỗi
// lần bấm sang từ kế tiếp. Là <button> thật (không phải div + onClick) nên bàn
// phím và trình đọc màn hình dùng được ngay, không cần thêm role/tabIndex.
function PreviewCard() {
  // Random NGAY lúc khởi tạo state, không phải trong effect: tránh nhá từ đầu
  // bảng rồi mới đổi. Chỉ chạy ở client nên không lệch hydrate (app dựng bằng
  // Vite, không SSR).
  // `changed` phân biệt từ đầu tiên (random lúc tải) với các từ do người dùng bấm:
  // vùng aria-live chỉ đọc khi người dùng đã bấm, tránh việc vừa mở trang trình
  // đọc màn hình đã xướng lên một từ chẳng ai yêu cầu.
  const [{ index, changed }, setWordState] = useState(() => ({
    index: Math.floor(Math.random() * PREVIEW_WORDS.length),
    changed: false,
  }));
  const word = PREVIEW_WORDS[index % PREVIEW_WORDS.length];
  const { days, bars } = previewMetrics(word.hanzi);
  const tones = toneNumbers(word.pinyin);

  return (
    <>
      <button
        type="button"
        className="core-card landing-preview"
        onClick={() => setWordState(current => ({
          index: (current.index + 1) % PREVIEW_WORDS.length,
          changed: true,
        }))}
        // Mô tả cả nội dung hiện tại và việc bấm sẽ làm gì, vì bản thân thẻ là nút.
        aria-label={`Xem trước phiên học: ${word.hanzi} (${word.pinyin}) — bấm để xem từ khác`}
      >
        <span className="landing-preview__top">
          <span className="landing-preview__dot" aria-hidden="true" />
          <span>Phiên học hôm nay</span>
          <strong>HSK {word.level}</strong>
        </span>

        {/* key={word.hanzi} cho React dựng lại nhánh này khi đổi từ, nhờ vậy
            animation hiện chữ chạy lại từ đầu mỗi lần bấm. */}
        <span className="landing-preview__word" key={word.hanzi}>
          <span className="landing-preview__hanzi" lang="zh-CN">{word.hanzi}</span>
          <span className="landing-preview__pinyin">{word.pinyin}</span>
          <span className="landing-preview__meaning">{word.meaning}</span>
        </span>

        <span className="landing-preview__meta">
          <span className="landing-chip landing-chip--jade">Ôn lại sau {days} ngày</span>
          <span className="landing-chip landing-chip--gold">
            {tones.map(tone => `Thanh ${tone}`).join(' · ')}
          </span>
        </span>

        <span className="landing-preview__bars">
          {bars.map(bar => (
            <span key={bar.label} className="landing-bar">
              <span className="landing-bar__label">{bar.label}</span>
              <span className="landing-bar__track">
                {/* key gắn theo từ: thanh chạy lại từ 0 mỗi lần đổi từ */}
                <span
                  key={`${word.hanzi}-${bar.label}`}
                  className="landing-bar__fill"
                  style={{ '--fill': `${bar.value}%` }}
                />
              </span>
              <span className="landing-bar__value">{bar.value}%</span>
            </span>
          ))}
        </span>

        <span className="landing-preview__note">
          <RefreshCw size={12} aria-hidden="true" />
          Số liệu minh hoạ · bấm để xem từ khác
        </span>
      </button>

      {/* Đổi aria-label của chính nút đang được focus thì trình đọc màn hình
          thường không xướng lại. Vùng aria-live riêng bên ngoài nút mới là chỗ
          thông báo từ mới đáng tin cậy. Chỉ có nội dung sau lần bấm đầu tiên. */}
      <span className="landing-sr-only" role="status" aria-live="polite">
        {changed ? `${word.hanzi} — ${word.pinyin} — ${word.meaning}` : ''}
      </span>
    </>
  );
}

function ThemeToggle({ theme, onToggle }) {
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      className="landing-theme-toggle"
      onClick={onToggle}
      aria-label={isDark ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối'}
      title={isDark ? 'Chế độ sáng' : 'Chế độ tối'}
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

// Không hỗ trợ IO, hoặc user muốn giảm chuyển động -> bỏ hiệu ứng hiện dần.
// Tính NGAY lúc khởi tạo state (không phải trong effect) để phần tử hiện sẵn ở
// lần render đầu: tránh cascading render và tránh nhá nội dung mờ rồi mới rõ.
function revealDisabled() {
  if (typeof IntersectionObserver === 'undefined') return true;
  if (typeof window === 'undefined') return true;
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

// Hiện dần khi cuộn tới. IntersectionObserver một chiều (unobserve sau lần đầu)
// để phần tử đã hiện không mờ lại khi cuộn ngược lên.
function Reveal({ children, className = '', delay = 0 }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(revealDisabled);

  useEffect(() => {
    const node = ref.current;
    if (!node || revealDisabled()) return;
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        setShown(true);
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`landing-reveal ${shown ? 'is-shown' : ''} ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

export default function LandingPage({ onLogin, onRegister }) {
  const [openFaq, setOpenFaq] = useState(null);
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => { applyTheme(theme); }, [theme]);

  return (
    <div className="landing">
      {/* Tinh hệ nền: tái dùng canvas của màn đăng nhập, KHÔNG truyền cardRef nên
          tâm hệ nằm giữa khung nhìn (landing không có form để quay quanh).
          key={theme} buộc remount khi đổi sáng/tối: component đọc data-theme một
          lần lúc khởi tạo effect, remount là cách đổi bảng màu mà không sửa nó. */}
      <div className="landing-cosmos" aria-hidden="true">
        <SpaceVortexBackground key={theme} active />
        {/* Ba lớp CSS phủ trên canvas để nền có chiều sâu thật:
            band = dải Ngân Hà chéo, veil = tối dần ở rìa cho chữ nổi lên,
            grain = hạt phim rất nhẹ, phá dải màu (banding) của gradient. */}
        <span className="landing-cosmos__band" />
        <span className="landing-cosmos__veil" />
        <span className="landing-cosmos__grain" />
      </div>

      <header className="landing-nav">
        <a className="landing-brand" href="#top">
          <img src="/logo.jpg" alt="" width="36" height="36" />
          <span>Tezca</span>
        </a>
        <nav className="landing-nav__links" aria-label="Điều hướng trang">
          <a href="#features">Tính năng</a>
          <a href="#how">Cách học</a>
          <a href="#faq">Câu hỏi</a>
        </nav>
        <div className="landing-nav__actions">
          <ThemeToggle
            theme={theme}
            onToggle={() => setTheme(current => (current === 'dark' ? 'light' : 'dark'))}
          />
          <button type="button" className="btn-secondary landing-nav__login" onClick={onLogin}>
            <LogIn size={16} /> Đăng nhập
          </button>
          <button type="button" className="btn-primary" onClick={onRegister}>
            <UserPlus size={16} /> Bắt đầu miễn phí
          </button>
        </div>
      </header>

      <main id="top">
        <section className="landing-hero">
          <Reveal className="landing-hero__copy">
            <p className="landing-eyebrow"><Sparkles size={14} /> Luyện HSK 1–6 bằng tiếng Việt</p>
            <h1>Học tiếng Trung theo cách của bạn</h1>
            <p className="landing-lede">
              Tezca đo xem bạn thật sự nhớ gì, phát âm lệch ở đâu, rồi dựng phiên học hôm nay
              quanh đúng những chỗ đó. Không phải học lại thứ bạn đã thuộc.
            </p>
            <div className="landing-hero__actions">
              <button type="button" className="btn-primary landing-cta" onClick={onRegister}>
                <UserPlus size={18} /> Tạo tài khoản miễn phí
              </button>
              <button type="button" className="btn-secondary landing-cta" onClick={onLogin}>
                <LogIn size={18} /> Tôi đã có tài khoản
              </button>
            </div>
            <ul className="landing-assurances">
              <li><CheckCircle2 size={15} /> Miễn phí toàn bộ tính năng</li>
              <li><WifiOff size={15} /> Học được khi mất mạng</li>
              <li><Award size={15} /> Chuỗi ngày học và danh hiệu</li>
            </ul>
          </Reveal>

          <Reveal className="landing-hero__panel" delay={120}>
            <PreviewCard />
          </Reveal>
        </section>

        <section className="landing-stats" aria-label="Số liệu nội dung">
          {STATS.map((stat, index) => (
            <Reveal key={stat.label} delay={index * 70}>
              <article className="core-card landing-stat">
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
                <small>{stat.hint}</small>
              </article>
            </Reveal>
          ))}
        </section>

        <section className="landing-section" id="features">
          <Reveal className="landing-section__head">
            <h2>Đủ công cụ cho từng kỹ năng</h2>
            <p>Mỗi phần dưới đây đã chạy trong ứng dụng, không phải kế hoạch tương lai.</p>
          </Reveal>
          <div className="landing-grid">
            {FEATURES.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <Reveal key={feature.title} delay={(index % 3) * 80}>
                  <article className={`core-card landing-feature landing-feature--${feature.tone}`}>
                    <span className="landing-feature__icon"><Icon size={20} /></span>
                    <h3>{feature.title}</h3>
                    <p>{feature.body}</p>
                  </article>
                </Reveal>
              );
            })}
          </div>
        </section>

        <section className="landing-section landing-section--tight">
          <Reveal className="landing-section__head">
            <h2>Sáu dạng bài luyện</h2>
            <p>Xoay vòng giữa các dạng để kỹ năng nhận biết và kỹ năng sản sinh không lệch nhau.</p>
          </Reveal>
          <div className="landing-kinds">
            {QUIZ_KINDS.map((kind, index) => {
              const Icon = kind.icon;
              return (
                <Reveal key={kind.label} delay={(index % 3) * 60}>
                  <article className="core-card landing-kind">
                    <Icon size={18} />
                    <strong>{kind.label}</strong>
                    <span>{kind.hint}</span>
                  </article>
                </Reveal>
              );
            })}
          </div>
        </section>

        <section className="landing-section" id="how">
          <Reveal className="landing-section__head">
            <h2>Cách một ngày học diễn ra</h2>
            <p>Ba bước lặp lại, mỗi vòng dữ liệu về bạn lại rõ hơn một chút.</p>
          </Reveal>
          <ol className="landing-steps">
            {STEPS.map((step, index) => (
              <Reveal key={step.title} delay={index * 90}>
                <li className="core-card landing-step">
                  <span className="landing-step__num">{index + 1}</span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </li>
              </Reveal>
            ))}
          </ol>
        </section>

        <section className="landing-section landing-section--tight" id="faq">
          <Reveal className="landing-section__head">
            <h2>Câu hỏi thường gặp</h2>
          </Reveal>
          <div className="landing-faq">
            {FAQ.map((item, index) => {
              const open = openFaq === index;
              return (
                <Reveal key={item.q} delay={index * 50}>
                  <article className={`core-card landing-faq__item ${open ? 'is-open' : ''}`}>
                    <h3>
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => setOpenFaq(open ? null : index)}
                      >
                        <span>{item.q}</span>
                        <span className="landing-faq__mark" aria-hidden="true" />
                      </button>
                    </h3>
                    {open && <p>{item.a}</p>}
                  </article>
                </Reveal>
              );
            })}
          </div>
        </section>

        <section className="landing-section">
          <Reveal>
            <article className="core-card landing-final">
              <h2>Bắt đầu từ hôm nay</h2>
              <p>Tạo tài khoản trong vài giây, dữ liệu học của bạn được giữ lại từ phiên đầu tiên.</p>
              <div className="landing-final__actions">
                <button type="button" className="btn-primary landing-cta" onClick={onRegister}>
                  <UserPlus size={18} /> Tạo tài khoản miễn phí
                </button>
                <button type="button" className="btn-secondary landing-cta" onClick={onLogin}>
                  <LogIn size={18} /> Đăng nhập
                </button>
              </div>
            </article>
          </Reveal>
        </section>
      </main>

      <footer className="landing-footer">
        <p>Tezca · Luyện HSK 1–6 cho người học nói tiếng Việt</p>
      </footer>
    </div>
  );
}
