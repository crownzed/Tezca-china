import { useState, useEffect } from 'react';
import {
  Home,
  PenLine,
  BookOpen,
  MessageCircle,
  ClipboardList,
  Trophy,
  CircleUser,
  BarChart3,
  Moon,
  Sun,
  Sprout,
  FileText,
  Coffee,
  Zap,
  Target,
  RefreshCw,
  AlertTriangle,
  Sparkles
} from 'lucide-react';
import './HanZiDashboard.css';

function getInitialDarkMode() {
  const stored = localStorage.getItem('hanzi-dark-mode');
  if (stored !== null) return stored === 'true';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyDarkMode(enabled) {
  if (enabled) {
    document.documentElement.classList.add('dark-mode');
  } else {
    document.documentElement.classList.remove('dark-mode');
  }
}

const HanZiDashboard = () => {
  const [activeMenu, setActiveMenu] = useState('home');
  const [isDarkMode, setIsDarkMode] = useState(getInitialDarkMode);
  const [isLocalMode, setIsLocalMode] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedDuration, setSelectedDuration] = useState(null);

  useEffect(() => {
    applyDarkMode(isDarkMode);
    localStorage.setItem('hanzi-dark-mode', isDarkMode);
  }, [isDarkMode]);

  const menuItems = [
    { id: 'home', label: 'Trang chính', icon: Home },
    { id: 'practice', label: 'Luyện tập', icon: PenLine },
    { id: 'vocab', label: 'Từ vựng', icon: BookOpen },
    { id: 'sentence', label: 'Luyện dùng', icon: MessageCircle },
    { id: 'plan', label: 'Kế hoạch', icon: ClipboardList },
    { id: 'rank', label: 'Xếp hạng', icon: Trophy },
    { id: 'profile', label: 'Hồ sơ', icon: CircleUser },
    { id: 'progress', label: 'Tiến độ', icon: BarChart3 }
  ];

  const learningCategories = [
    { id: 'natural', label: 'Học tự nhiên', icon: Sprout },
    { id: 'hsk', label: 'Luyện thi HSK', icon: FileText },
    { id: 'daily', label: 'Chủ đề hàng ngày', icon: Coffee },
    { id: 'speaking', label: 'Giao tiếp', icon: MessageCircle }
  ];

  const studyDurations = [
    { id: 'quick', time: '5 phút', description: 'Ôn nhanh', icon: Zap },
    { id: 'standard', time: '20 phút', description: 'Học chuẩn', icon: BookOpen },
    { id: 'deep', time: '45 phút', description: 'Học sâu', icon: Target }
  ];

  const habitStats = [
    { id: 'review', label: 'Cần ôn', count: 12, icon: RefreshCw, color: '#D97706' },
    { id: 'errors', label: 'Sửa lỗi', count: 3, icon: AlertTriangle, color: '#DC2626' },
    { id: 'new-words', label: 'Từ mới', count: 24, icon: Sparkles, color: '#059669' }
  ];

  return (
    <div className="dashboard-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="logo">
          <h1>HànZì</h1>
        </div>
        <nav className="menu">
          {menuItems.map(item => (
            <button
              key={item.id}
              className={`menu-item ${activeMenu === item.id ? 'active' : ''}`}
              onClick={() => setActiveMenu(item.id)}
              aria-current={activeMenu === item.id ? 'page' : undefined}
            >
              <span className="menu-icon" aria-hidden="true">
                <item.icon size={20} />
              </span>
              <span className="menu-label">{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {/* Header */}
        <header className="top-header">
          <div className="header-left">
            <label className="local-mode-toggle">
              <input
                type="checkbox"
                checked={isLocalMode}
                onChange={(e) => setIsLocalMode(e.target.checked)}
              />
              <span>Chế độ local</span>
            </label>
          </div>
          <div className="header-right">
            <button className="btn-outline" type="button">Đăng nhập</button>
            <button className="btn-primary" type="button">Đăng ký</button>
            <button
              className="theme-toggle"
              onClick={() => setIsDarkMode(prev => !prev)}
              aria-label={isDarkMode ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối'}
            >
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>

        {/* Content Cards */}
        <div className="content-wrapper">
          {/* Card 1: Hero */}
          <section className="card hero-card">
            <h2 className="card-title">Bắt đầu học tự nhiên</h2>
            <p className="card-description">
              Chọn phương pháp phù hợp với mục tiêu của bạn
            </p>

            <div className="categories-grid">
              {learningCategories.map(cat => (
                <button
                  key={cat.id}
                  className={`category-tag ${selectedCategory === cat.id ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(cat.id)}
                  type="button"
                >
                  <span className="category-icon" aria-hidden="true">
                    <cat.icon size={24} />
                  </span>
                  <span className="category-label">{cat.label}</span>
                </button>
              ))}
            </div>

            <button className="btn-cta" type="button">
              Vào học ngay
            </button>
          </section>

          {/* Card 2: Học hôm nay */}
          <section className="card">
            <h2 className="card-title">Học hôm nay</h2>
            <p className="card-description">Chọn thời gian học phù hợp</p>

            <div className="duration-grid">
              {studyDurations.map(duration => (
                <button
                  key={duration.id}
                  className={`duration-card ${selectedDuration === duration.id ? 'active' : ''}`}
                  onClick={() => setSelectedDuration(duration.id)}
                  type="button"
                >
                  <div className="duration-icon" aria-hidden="true">
                    <duration.icon size={32} />
                  </div>
                  <div className="duration-time">{duration.time}</div>
                  <div className="duration-desc">{duration.description}</div>
                </button>
              ))}
            </div>
          </section>

          {/* Card 3: Xây thói quen */}
          <section className="card habits-card">
            <h2 className="card-title">Xây thói quen học tập</h2>
            <div className="habits-stats">
              {habitStats.map(stat => (
                <div key={stat.id} className="habit-item">
                  <div className="habit-icon" style={{ color: stat.color }} aria-hidden="true">
                    <stat.icon size={28} />
                  </div>
                  <div className="habit-content">
                    <div className="habit-label">{stat.label}</div>
                    <div className="habit-count" style={{ color: stat.color }}>
                      {stat.count}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default HanZiDashboard;
