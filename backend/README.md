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
