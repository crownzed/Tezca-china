import { Component } from 'react';
import HanZiDashboard from './components/HanZiDashboard';
import './App.css';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h2>Đã xảy ra lỗi</h2>
          <p>Vui lòng thử tải lại trang</p>
          <button onClick={() => window.location.reload()}>
            Tải lại trang
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

function App() {
  return (
    <ErrorBoundary>
      <HanZiDashboard />
    </ErrorBoundary>
  );
}

export default App;
