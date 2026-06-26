import json
import logging
import threading
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select

from .db import SessionLocal, init_db
from .models import Word
from .routers.auth import router as auth_router
from .routers.leaderboard import router as leaderboard_router
from .routers.quiz import router as quiz_router
from .routers.custom_vocab import router as custom_vocab_router
from .settings import settings

logger = logging.getLogger(__name__)

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(leaderboard_router)
app.include_router(quiz_router)
app.include_router(custom_vocab_router)


def _seed_if_empty() -> None:
    with SessionLocal() as db:
        count = db.scalar(select(func.count()).select_from(Word)) or 0
        if count > 0:
            return
        from .scripts.seed import seed_examples, seed_hsk_examples, seed_words

        seed_words(db)
        seed_hsk_examples(db)
        seed_examples(db)


def _ensure_vocab() -> None:
    """Import HSK 3-5 vocabulary from frontend vocab-bank if not already present."""
    with SessionLocal() as db:
        from sqlalchemy import func, select
        from .models import Word
        hsk3_count = db.scalar(select(func.count()).select_from(Word).where(Word.hsk_level >= 3)) or 0
        if hsk3_count > 0:
            return
        from .scripts.import_vocab_bank import main as import_vocab
        import_vocab()


@app.on_event("startup")
def startup() -> None:
    # KHÔNG chạm DB đồng bộ ở đây. init_db() phải kết nối Postgres; nếu
    # DATABASE_URL sai/không tới được, lệnh đó treo -> uvicorn không mở cổng
    # -> mọi request timeout (000). Đẩy TẤT CẢ sang thread nền để cổng mở
    # ngay; /health tự báo db_connected=false nếu DB chưa sẵn sàng.
    threading.Thread(target=_warm_up_data, name="warm-up-data", daemon=True).start()


def _warm_up_data() -> None:
    """Tạo bảng + seed + import + pregenerate chạy nền. Lỗi ở đây không được
    làm sập app: dữ liệu vẫn sinh on-demand khi có request."""
    try:
        init_db()
    except Exception:
        logger.exception("init_db failed")
        return  # không có bảng thì các bước sau vô nghĩa
    try:
        _seed_if_empty()
    except Exception:
        logger.exception("seed_if_empty failed")
    try:
        _ensure_vocab()
    except Exception:
        logger.exception("ensure_vocab failed")
    try:
        from .scripts.pregenerate_questions import pregenerate_questions
        with SessionLocal() as db:
            pregenerate_questions(db)
            db.commit()
    except Exception:
        logger.exception("pregenerate_questions failed")  # non-critical


@app.get("/health")
def health():
    # KHÔNG để health phụ thuộc DB đã seed xong. Trả 200 ngay cả khi DB chưa
    # sẵn sàng để Render health check pass + giúp chẩn đoán (db_connected).
    try:
        with SessionLocal() as db:
            word_count = db.scalar(select(func.count()).select_from(Word)) or 0
            from .models import Example, Question, QuizAttempt

            example_count = db.scalar(select(func.count()).select_from(Example)) or 0
            question_count = db.scalar(select(func.count()).select_from(Question)) or 0
            attempt_count = db.scalar(select(func.count()).select_from(QuizAttempt)) or 0

            level_dist = {}
            rows = db.execute(
                select(Question.level, func.count(Question.id)).group_by(Question.level)
            ).all()
            for level, count in rows:
                level_dist[f"HSK_{level}"] = count
    except Exception as exc:
        # DB chưa sẵn sàng (đang warm-up hoặc DATABASE_URL sai) — vẫn trả 200
        # nhưng nói rõ trạng thái thay vì treo/500.
        return {
            "status": "starting",
            "db_connected": False,
            "detail": str(exc)[:200],
            "server_time": datetime.now(timezone.utc).isoformat(),
        }

    audit_path = Path(__file__).resolve().parents[1] / "data" / "qa_report.json"
    last_audit = None
    if audit_path.exists():
        try:
            raw = json.loads(audit_path.read_text(encoding="utf-8"))
            last_audit = {
                "run_id": raw.get("run_id"),
                "status": raw.get("status"),
                "generated_at": raw.get("generated_at"),
            }
        except Exception:
            pass

    return {
        "status": "ok",
        "db_connected": True,
        "word_count": word_count,
        "example_count": example_count,
        "question_count": question_count,
        "total_attempts": attempt_count,
        "questions_per_level": level_dist,
        "last_audit": last_audit,
        "server_time": datetime.now(timezone.utc).isoformat(),
    }
