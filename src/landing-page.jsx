import { BarChart3, Blocks, BookOpen, CalendarCheck, Layers, LineChart, LogIn, Mic, Play, ScrollText, Shuffle, UserPlus } from 'lucide-react';
import HeroPronunciationDemo from './components/HeroPronunciationDemo.jsx';
import useRevealOnScroll from './components/useRevealOnScroll.js';

// Trang landing cho người CHƯA đăng nhập, render TRƯỚC AuthGate.
// Cho thử demo phát âm, giới thiệu tính năng, rồi mời tạo tài khoản.
// Không đọc/ghi dữ liệu người dùng, không gọi endpoint nào ngoài demo phát âm.
//
// MỌI CON SỐ dưới đây là số thật, đếm từ repo — sửa tính năng thì sửa cả đây:
//   5.851 từ HSK 1–6 ....... backend/app/data/words_export.json
//   3.015 từ có câu ví dụ ... cùng file
//   35 cấu trúc / 3.460 câu . src/grammar-specs/ (log validate-grammar.mjs)
//   24 đoạn 选词填空 / 87 chỗ trống, 24 đoạn đọc hiểu / 48 câu hỏi
//                           ... backend/app/data/exam_passages.json
//   11 dạng bài ............. enum QuizType, backend/app/models.py

const STATS = [
  { value: '5.851', label: 'từ vựng HSK 1-6' },
  { value: '35', label: 'cấu trúc ngữ pháp' },
  { value: '11', label: 'dạng bài luyện thi' },
  { value: '3.015', label: 'từ kèm câu ví dụ' },
];

// Trụ đầu là điểm khác biệt lớn nhất nên tách hẳn thành panel dẫn đề (lead),
// ba trụ còn lại xếp so le bên dưới.
const PILLARS = [
  {
    icon: Mic,
    title: 'Chấm phát âm bằng tín hiệu số',
    lead: true,
    body: 'Không chỉ đúng hay sai. Hệ thống trích đường cao độ F0 khỏi bản ghi bằng Praat, chuẩn hoá log-Z để khử khác biệt giọng cao thấp giữa bạn và người bản ngữ, rồi dùng DTW so đường cao độ đó với mẫu thanh điệu Chao 5 bậc. Kết quả chỉ ra đúng âm tiết nào bị lệch và lệch theo hướng nào.',
  },
  {
    icon: ScrollText,
    title: 'Ngân hàng đề theo dạng thật',
    body: '11 dạng bài, gồm 24 đoạn 选词填空 với 87 chỗ trống và 24 đoạn đọc hiểu với 48 câu hỏi. Chỗ trống hiển thị trong toàn đoạn nên vẫn phải đọc hiểu ngữ cảnh, không đoán mò theo một câu lẻ.',
  },
  {
    icon: Blocks,
    title: 'Ngữ pháp sinh câu từ mẫu',
    body: '35 cấu trúc, mỗi cấu trúc nở ra khoảng 100 câu khác nhau từ template thay vì một bộ câu cố định. Học lần hai không gặp lại đúng câu cũ nên không nhớ vẹt được đáp án.',
  },
  {
    icon: Layers,
    title: 'Từ vựng bốn chế độ',
    body: 'Tra cứu, thẻ lật tự đánh giá, gõ lại từ, và phân biệt cặp dễ nhầm. Bốn chế độ ghi vào cùng một lịch ôn cho mỗi từ, nên học kiểu nào cũng cộng dồn.',
  },
];

// Nhãn là chính động từ của bước, không dùng "Bước 1/2/3" vì nhãn đó rỗng nghĩa.
const STEPS = [
  {
    icon: BookOpen,
    title: 'Chọn cấp và dạng bài',
    body: 'Chọn một hoặc nhiều cấp HSK cùng lúc, rồi chọn dạng bài muốn luyện.',
  },
  {
    icon: Play,
    title: 'Luyện và nhận phản hồi ngay',
    body: 'Mỗi câu trả lời được chấm tức thì kèm giải thích, không phải chờ hết bài.',
  },
  {
    icon: CalendarCheck,
    title: 'Hệ thống xếp lại lịch ôn',
    body: 'Từ nào bạn sai hoặc do dự sẽ được kéo lên hạn ôn sớm hơn, tự động.',
  },
];

const METHOD = [
  {
    icon: LineChart,
    title: 'Lịch ôn riêng cho từng từ',
    body: 'Thuật toán SM-2 lite giữ một lịch ôn độc lập cho mỗi từ, với hệ số ease dao động trong khoảng 1,3 đến 3,2 tuỳ độ nhớ của bạn. Trả lời đúng thì giãn khoảng cách ôn, sai thì đặt lại. Ôn bằng thẻ lật hay bằng quiz đều ghi vào cùng một lịch của từ đó.',
  },
  {
    icon: BarChart3,
    title: 'Năm nấc thụ đắc thay cho phần trăm',
    body: 'Mỗi từ đi qua năm nấc: Chưa biết, Nhận ra, Hiểu, Dùng được, Thuần thục. Thước đo này cho biết bạn đang ở đâu với từng từ, khác với con số phần trăm hoàn thành không nói lên bạn thực sự dùng được từ hay chưa.',
  },
  {
    icon: Shuffle,
    title: 'Ba chiến lược cho một phiên học',
    body: 'Tập trung luyện một dạng bài với phản hồi tức thì. Xoay kỹ năng trộn các kỹ năng liên quan để kiểm tra bạn có chuyển được kiến thức sang ngữ cảnh khác. Sửa lỗi ưu tiên những câu dễ lộ lỗi rồi chèn vòng luyện lại ngay trong phiên.',
  },
];

const FAQ = [
  {
    q: 'Có cần cài đặt gì không?',
    a: 'Không. Toàn bộ chạy trong trình duyệt. Phần chấm phát âm dùng micro qua Web Audio, bạn chỉ cần cho phép truy cập micro khi được hỏi.',
  },
  {
    q: 'Thử được trước khi tạo tài khoản không?',
    a: 'Được. Khối demo phát âm ở đầu trang chạy đầy đủ mà không cần đăng nhập. Các phần còn lại cần tài khoản để lưu tiến độ học của bạn.',
  },
  {
    q: 'Chấm phát âm chính xác đến đâu?',
    a: 'Hệ thống so đường cao độ thật của bạn với mẫu thanh điệu, nên phát hiện được lỗi hướng thanh điệu mà tai người mới học thường bỏ qua. Nó đo đường cao độ, không đánh giá khẩu hình hay ngữ điệu cả câu, và cần bản ghi đủ rõ để tách được cao độ.',
  },
  {
    q: 'Học được tới HSK mấy?',
    a: 'Kho từ vựng phủ HSK 1 đến 6 với 5.851 từ. Phần ngữ pháp hiện có 35 cấu trúc, tập trung nhiều nhất ở HSK 1 đến 3.',
  },
  {
    q: 'Tiến độ học lưu ở đâu?',
    a: 'Lịch ôn từng từ được lưu cùng tài khoản của bạn, nên đổi máy vẫn còn. Một phần được giữ thêm trong trình duyệt để phần ôn tập chạy được ngay không cần chờ mạng.',
  },
];

// Số liệu: không bọc thẻ, chỉ ngăn bằng 1px và để số thở trong khoảng trắng.
function StatsBand() {
  const ref = useRevealOnScroll();
  return (
    <section className="landing-section landing-stats" aria-labelledby="landing-stats-title">
      <h2 id="landing-stats-title" className="sr-only">Nội dung hiện có</h2>
      <dl className="landing-stats-row landing-reveal" ref={ref}>
        {STATS.map(stat => (
          <div key={stat.label} className="landing-stat">
            <dt>{stat.label}</dt>
            <dd>{stat.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// Trụ dẫn đề đứng riêng một khối rộng; ba trụ còn lại xếp so le hai cột lệch
// (2fr/1fr) và chỉ dùng đường kẻ trên để nhóm, thay cho ba thẻ bằng nhau.
function Pillars() {
  const [lead, ...rest] = PILLARS;
  const LeadIcon = lead.icon;
  const restRef = useRevealOnScroll();

  return (
    <section className="landing-section" aria-labelledby="landing-pillars-title">
      <h2 id="landing-pillars-title" className="landing-section-title">Bốn phần bạn sẽ dùng nhiều nhất</h2>

      <article className="landing-pillar-lead">
        <span className="landing-pillar-icon" aria-hidden="true"><LeadIcon size={22} strokeWidth={1.5} /></span>
        <div className="landing-pillar-lead-text">
          <h3>{lead.title}</h3>
          <p>{lead.body}</p>
        </div>
      </article>

      <div className="landing-pillar-rest landing-reveal" ref={restRef}>
        {rest.map(({ icon: Icon, title, body }) => (
          <article key={title} className="landing-pillar">
            <span className="landing-pillar-icon" aria-hidden="true"><Icon size={20} strokeWidth={1.5} /></span>
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

// Ba bước theo trục dọc có đường nối: đọc được thứ tự mà không cần ba thẻ ngang.
function Steps() {
  const ref = useRevealOnScroll();
  return (
    <section className="landing-section landing-steps-section" aria-labelledby="landing-steps-title">
      <h2 id="landing-steps-title" className="landing-section-title">Một phiên học diễn ra thế nào</h2>
      <ol className="landing-step-rail landing-reveal" ref={ref}>
        {STEPS.map(({ icon: Icon, title, body }) => (
          <li key={title} className="landing-step">
            <span className="landing-step-icon" aria-hidden="true"><Icon size={18} strokeWidth={1.5} /></span>
            <div className="landing-step-text">
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Method() {
  const ref = useRevealOnScroll();
  return (
    <section className="landing-section" aria-labelledby="landing-method-title">
      <h2 id="landing-method-title" className="landing-section-title">Cách hệ thống quyết định bạn ôn gì</h2>
      <div className="landing-method-list landing-reveal" ref={ref}>
        {METHOD.map(({ icon: Icon, title, body }) => (
          <article key={title} className="landing-method-item">
            <span className="landing-method-icon" aria-hidden="true"><Icon size={20} strokeWidth={1.5} /></span>
            <div className="landing-method-text">
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

// <details> gốc HTML: có sẵn hỗ trợ bàn phím và trình đọc màn hình, không cần JS.
function Faq() {
  return (
    <section className="landing-section landing-faq-section" aria-labelledby="landing-faq-title">
      <h2 id="landing-faq-title" className="landing-section-title">Câu hỏi thường gặp</h2>
      <div className="landing-faq">
        {FAQ.map(item => (
          <details key={item.q} className="landing-faq-item">
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

// Nhãn CTA trùng y hệt nhãn ở header để không tạo hai ý định trùng lặp.
function ClosingCta({ onEnter }) {
  return (
    <section className="landing-section landing-closing" aria-labelledby="landing-closing-title">
      <div className="landing-closing-text">
        <h2 id="landing-closing-title">Bắt đầu với cấp HSK bạn đang học</h2>
        <p>Tạo tài khoản để lưu lịch ôn từng từ và tiếp tục đúng chỗ đã dừng.</p>
      </div>
      <button type="button" className="btn-primary landing-closing-btn" onClick={onEnter}>
        <UserPlus size={18} strokeWidth={1.5} /> Đăng ký
      </button>
    </section>
  );
}

export default function LandingPage({ onEnter }) {
  return (
    <div className="landing">
      <header className="landing-top">
        <div className="landing-brand">
          <img src="/logo.jpg" alt="Tezca" />
          <span>Học tiếng Trung theo cách của tôi</span>
        </div>
        <nav className="landing-top-actions" aria-label="Đăng nhập hoặc đăng ký">
          <button type="button" className="btn-secondary" onClick={onEnter}>
            <LogIn size={16} strokeWidth={1.5} /> Đăng nhập
          </button>
          <button type="button" className="btn-primary" onClick={onEnter}>
            <UserPlus size={16} strokeWidth={1.5} /> Đăng ký
          </button>
        </nav>
      </header>

      <main>
        <div className="landing-hero">
          <div className="landing-hero-copy">
            <p className="landing-eyebrow">
              <span className="landing-eyebrow-dot" aria-hidden="true" />
              Luyện thi HSK 1-6 cho người học tiếng Việt
            </p>
            <h1>Phát âm đúng thanh điệu ngay từ câu đầu tiên</h1>
            <p className="landing-hero-lede">
              AI nghe bạn đọc, so đường cao độ với người bản ngữ và chỉ ra chính xác
              thanh điệu nào bị lệch. Không cần cài đặt, không cần tài khoản để thử.
            </p>
            <ul className="landing-points">
              <li>Chấm điểm thanh điệu theo đường F0 thật, không chỉ đúng/sai</li>
              <li>Lộ trình HSK 1-6 kèm quiz, ngữ pháp và thẻ lật ghi nhớ</li>
              <li>Ôn tập giãn cách (SRS) tự nhắc đúng từ bạn hay quên</li>
            </ul>
          </div>

          <div className="landing-hero-demo">
            <HeroPronunciationDemo onRegister={onEnter} />
          </div>
        </div>

        <StatsBand />
        <Pillars />
        <Steps />
        <Method />
        <Faq />
        <ClosingCta onEnter={onEnter} />
      </main>

      <footer className="landing-footer">
        <p>Tezca · Công cụ luyện thi HSK cho người học tiếng Việt</p>
      </footer>
    </div>
  );
}
