import { Component } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';

/**
 * Lưới an toàn cho lỗi lúc render. Trước đây app không có ErrorBoundary nào,
 * nên một exception ở BẤT KỲ component con nào (vd tab Tiến độ render với dữ
 * liệu lạ) sẽ làm sập toàn bộ cây React -> trang trắng. Boundary này giữ phần
 * còn lại của app sống, hiện thông báo đọc được và lộ chi tiết lỗi để chẩn đoán.
 *
 * Đặt key theo tab khi dùng để khi đổi tab boundary tự remount (xóa lỗi cũ).
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Giữ lại để xem trong console của bản deploy.
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <main className="core-page page-enter">
        <section className="core-card feedback-panel feedback-panel--error">
          <div className="feedback-head">
            <AlertCircle size={20} />
            <strong>Mục này gặp lỗi hiển thị</strong>
          </div>
          <p>Phần còn lại của ứng dụng vẫn dùng được. Bạn có thể thử lại hoặc chuyển sang mục khác.</p>
          <pre style={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontSize: '0.78rem',
            opacity: 0.75,
            margin: '0.75rem 0',
          }}>{String(error?.message || error)}</pre>
          <button className="btn-primary" type="button" onClick={this.handleReset}>
            <RotateCcw size={16} /> Thử lại
          </button>
        </section>
      </main>
    );
  }
}
