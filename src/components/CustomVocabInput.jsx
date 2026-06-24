import { useState } from 'react';
import { generateCustomVocabExercises } from '../api-core';
import { Loader2, PlusCircle, CheckCircle2 } from 'lucide-react';

export default function CustomVocabInput({ onSessionCreated }) {
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleGenerate = async () => {
    // Tách từ vựng dựa trên xuống dòng hoặc dấu phẩy
    const rawWords = inputText
      .split(/[\n,，]+/)
      .map(w => w.trim())
      .filter(w => w.length > 0);

    // Xóa từ trùng lặp
    const uniqueWords = [...new Set(rawWords)];

    if (uniqueWords.length === 0) {
      setError('Vui lòng nhập ít nhất một từ vựng.');
      return;
    }

    if (uniqueWords.length > 20) {
      setError('Để đảm bảo tốc độ, vui lòng chỉ nhập tối đa 20 từ mỗi lần.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await generateCustomVocabExercises({ words: uniqueWords });
      setSuccess(response.message || 'Tạo bài tập thành công!');
      setInputText('');
      
      // Mở session học vừa tạo sau một khoảng chờ ngắn
      if (response.session_id) {
        setTimeout(() => {
          onSessionCreated(response.session_id, response.questions);
        }, 1500);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Đã có lỗi xảy ra khi tạo bài tập.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="core-page page-enter">
      <section className="core-card core-section-head">
        <span className="core-eyebrow">Custom Vocab</span>
        <h1>Tạo bài tập tùy chỉnh</h1>
        <p>Nhập danh sách từ vựng bạn muốn học. Hệ thống sẽ sử dụng AI (DeepSeek) để tự động tra cứu nghĩa, pinyin và tạo ra các dạng bài tập tương ứng.</p>
      </section>

      <section className="core-card">
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
            Danh sách từ vựng (mỗi từ một dòng, hoặc cách nhau bởi dấu phẩy):
          </label>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={loading}
            placeholder="苹果\n香蕉\n电脑"
            style={{
              width: '100%',
              minHeight: '200px',
              padding: '1rem',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              background: 'var(--card-bg)',
              color: 'var(--ink)',
              fontFamily: 'inherit',
              resize: 'vertical'
            }}
          />
        </div>

        {error && (
          <div className="feedback-panel feedback-panel--error" style={{ marginBottom: '1rem' }}>
            <p>{error}</p>
          </div>
        )}

        {success && (
          <div className="feedback-panel feedback-panel--correct" style={{ marginBottom: '1rem' }}>
            <CheckCircle2 size={18} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '0.5rem' }} />
            <p style={{ display: 'inline-block', margin: 0 }}>{success}</p>
          </div>
        )}

        <button 
          className="btn-primary" 
          type="button" 
          onClick={handleGenerate} 
          disabled={loading || !inputText.trim()}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          {loading ? (
            <>
              <Loader2 size={18} className="pulse-anim" style={{ animation: 'spin 1s linear infinite' }} />
              Đang tạo bài tập (có thể mất 10-30 giây)...
            </>
          ) : (
            <>
              <PlusCircle size={18} />
              Tạo tự động bằng AI
            </>
          )}
        </button>
      </section>
    </main>
  );
}
