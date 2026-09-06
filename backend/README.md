# Backend Core

Luồng chính:

```text
Raw Data (HSK JSON + CEDICT JSON + Tatoeba)
  -> backend/app/scripts/seed.py
  -> PostgreSQL tables: words, examples, questions
  -> POST /api/quiz
  -> QuestionGeneratorService creates missing questions
  -> Frontend submits answers to POST /api/quiz/submit
  -> quiz_attempts + user_progress + /api/stats
```

Run local:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
$env:DATABASE_URL="postgresql+psycopg://user:pass@localhost:5432/chinese_app"
python -m app.scripts.seed
uvicorn app.main:app --reload --port 8000
```

Nếu không đặt `DATABASE_URL`, backend dùng `sqlite:///./dev.db` để test nhanh.

## Chat giọng nói

Luồng mặc định dùng Gemini Native để nhận dạng âm thanh và Gemini/ElevenLabs
cho giọng đọc. Khai báo tối thiểu trong `.env`:

```dotenv
GEMINI_NATIVE_API_KEYS=your_ai_studio_key
GEMINI_NATIVE_MODEL=gemini-2.5-flash
GEMINI_TTS_MODEL=gemini-2.5-flash-preview-tts
GEMINI_TTS_VOICE=Kore
```

Khi người học nói qua micro, backend tự chép audio thành chữ rồi gửi Cloud
trả lời; nếu chỉ nhắn tin văn bản thì bước nhận dạng được bỏ qua.
