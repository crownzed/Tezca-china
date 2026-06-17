import React, { useState } from 'react';
import './HanZiDashboard.css';

// Icons (giả định, thay bằng icon library thật như react-icons)
const HomeIcon = () => <span>🏠</span>;
const PracticeIcon = () => <span>✍️</span>;
const VocabIcon = () => <span>📚</span>;
const SentenceIcon = () => <span>💬</span>;
const PlanIcon = () => <span>📋</span>;
const RankIcon = () => <span>🏆</span>;
const ProfileIcon = () => <span>👤</span>;
const ProgressIcon = () => <span>📊</span>;
const MoonIcon = () => <span>🌙</span>;
const SunIcon = () => <span>☀️</span>;

const HanZiDashboard = () => {
  const [activeMenu, setActiveMenu] = useState('home');
  const [isDarkMode, setIsDarkMode] = useState(false);

  const menuItems = [
    { id: 'home', label: 'Trang chính', icon: <HomeIcon /> },
    { id: 'practice', label: 'Luyện tập', icon: <PracticeIcon /> },
    { id: 'vocab', label: 'Từ vựng', icon: <VocabIcon /> },
    { id: 'sentence', label: 'Luyện dùng', icon: <SentenceIcon /> },
    { id: 'plan', label: 'Kế hoạch', icon: <PlanIcon /> },
    { id: 'rank', label: 'Xếp hạng', icon: <RankIcon /> },
    { id: 'profile', label: 'Hồ sơ', icon: <ProfileIcon /> },
    { id: 'progress', label: 'Tiến độ', icon: <ProgressIcon /> }
  ];

  const learningCategories = [
    { id: 1, label: 'Học tự nhiên', icon: '🌱' },
    { id: 2, label: 'Luyện thi HSK', icon: '📝' },
    { id: 3, label: 'Chủ đề hàng ngày', icon: '☕' },
    { id: 4, label: 'Giao tiếp', icon: '💬' }
  ];

  const studyDurations = [
    { time: '5 phút', description: 'Ôn nhanh', icon: '⚡' },
    { time: '20 phút', description: 'Học chuẩn', icon: '📖' },
    { time: '45 phút', description: 'Học sâu', icon: '🎯' }
  ];

  const habitStats = [
    { label: 'Cần ôn', count: 12, icon: '🔄', color: '#F59E0B' },
    { label: 'Sửa lỗi', count: 3, icon: '⚠️', color: '#EF4444' },
    { label: 'Từ mới', count: 24, icon: '✨', color: '#10B981' }
  ];

  return (
    <div className={`dashboard-container ${isDarkMode ? 'dark-mode' : ''}`}>
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
            >
              <span className="menu-icon">{item.icon}</span>
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
              <input type="checkbox" />
              <span>Chế độ local</span>
            </label>
          </div>
          <div className="header-right">
            <button className="btn-outline">Đăng nhập</button>
            <button className="btn-primary">Đăng ký</button>
            <button 
              className="theme-toggle"
              onClick={() => setIsDarkMode(!isDarkMode)}
            >
              {isDarkMode ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
        </header>

        {/* Content Cards */}
        <div className="content-wrapper">
          {/* Card 1: Hero - Bắt đầu học */}
          <section className="card hero-card">
            <h2 className="card-title">Bắt đầu học tự nhiên</h2>
            <p className="card-description">
              Chọn phương pháp phù hợp với mục tiêu của bạn
            </p>
            
            <div className="categories-grid">
              {learningCategories.map(cat => (
                <div key={cat.id} className="category-tag">
                  <span className="category-icon">{cat.icon}</span>
                  <span className="category-label">{cat.label}</span>
                </div>
              ))}
            </div>

            <button className="btn-cta">
              Vào học ngay
            </button>
          </section>

          {/* Card 2: Học hôm nay */}
          <section className="card">
            <h2 className="card-title">Học hôm nay</h2>
            <p className="card-description">Chọn thời gian học phù hợp</p>
            
            <div className="duration-grid">
              {studyDurations.map((duration, idx) => (
                <div key={idx} className="duration-card">
                  <div className="duration-icon">{duration.icon}</div>
                  <div className="duration-time">{duration.time}</div>
                  <div className="duration-desc">{duration.description}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Card 3: Xây thói quen & Thông báo */}
          <section className="card habits-card">
            <h2 className="card-title">Xây thói quen học tập</h2>
            <div className="habits-stats">
              {habitStats.map((stat, idx) => (
                <div key={idx} className="habit-item">
                  <div className="habit-icon" style={{ color: stat.color }}>
                    {stat.icon}
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
