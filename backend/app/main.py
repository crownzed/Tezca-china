import json
import logging
import os
import threading
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select

from .db import SessionLocal, init_db
from .models import Word
from .routers.admin import router as admin_router
from .routers.auth import router as auth_router
from .routers.grammar import router as grammar_router
from .routers.leaderboard import router as leaderboard_router
from .routers.quiz import router as quiz_router
from .routers.custom_vocab import router as custom_vocab_router
from .routers.tts import router as tts_router
from .routers.speech import router as speech_router
from .routers.translation import router as translation_router
from .routers.words import router as words_router
from .services import tts_cache, tts_socket_pool
from .settings import settings

logger = logging.getLogger(__name__)

app = FastAPI(title=settings.app_name)


class MaxBodySizeMiddleware:
    """Chặn request body vượt trần TRƯỚC khi nó được đọc vào RAM.

    Vì sao phải là middleware ASGI thuần chứ không phải dependency: FastAPI đọc
    TRỌN body rồi mới chạy ``solve_dependencies``, nên mọi ``Field(max_length=...)``
    trong schemas.py, mọi ``Depends(get_current_user)`` và mọi ``RateLimiter.allow``
    của codebase này chỉ thực thi khi payload đã nằm sẵn trong bộ nhớ. Trên máy Fly
    512MB (fly.toml:29-31) một body ~300MB tới ``/api/speech/demo-pronunciation``
    (không cần đăng nhập) là đủ OOM kill, và ``min_machines_running = 1`` nghĩa là
    lặp lại thì mất dịch vụ liên tục. ``BaseHTTPMiddleware`` cũng không dùng được
    ở đây vì bản thân nó đã buffer body.

    Hai đường vào, vì client không bắt buộc phải khai đúng:
      1. ``Content-Length`` lớn hơn trần -> 413 ngay, không đọc byte nào.
      2. Không có ``Content-Length`` (chunked) hoặc khai thấp rồi gửi nhiều hơn ->
         đếm byte khi stream, vượt trần thì cắt thân và đổi phản hồi thành 413.
    """

    def __init__(self, app, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send) -> None:
        # lifespan/websocket không có body -> đi thẳng.
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        declared = self._declared_length(scope)
        if declared is not None and declared > self.max_bytes:
            await self._reject(send)
            return

        state = {"counted": 0, "over": False, "blocked": False}

        async def limited_receive():
            message = await receive()
            if message.get("type") == "http.request":
                state["counted"] += len(message.get("body", b"") or b"")
                if state["counted"] > self.max_bytes:
                    # Cắt thân tại đây: app thấy body ngắn/không hợp lệ và sẽ
                    # không đọc thêm byte nào nữa. Bộ nhớ do đó bị chặn trên.
                    state["over"] = True
                    return {"type": "http.request", "body": b"", "more_body": False}
            return message

        async def guarded_send(message) -> None:
            # Chỉ can thiệp ở đúng thời điểm app bắt đầu phản hồi. Kiểm ở đây (chứ
            # không phải mọi message) để một phản hồi đã bắt đầu gửi không bao giờ
            # bị cắt giữa dòng.
            if message.get("type") == "http.response.start":
                if state["over"]:
                    state["blocked"] = True
                    await self._reject(send)
                    return
            elif state["blocked"]:
                return
            await send(message)

        await self.app(scope, limited_receive, guarded_send)

    @staticmethod
    def _declared_length(scope) -> int | None:
        for name, value in scope.get("headers") or []:
            if name == b"content-length":
                try:
                    return int(value)
                except (TypeError, ValueError):
                    return None
        return None

    async def _reject(self, send) -> None:
        payload = json.dumps(
            {"detail": f"Request body vượt trần {self.max_bytes} byte"}
        ).encode("utf-8")
        await send(
            {
                "type": "http.response.start",
                "status": 413,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(payload)).encode("ascii")),
                ],
            }
        )
        await send({"type": "http.response.body", "body": payload})


# Thứ tự có chủ ý: add_middleware chèn vào ĐẦU stack, nên cái thêm SAU nằm NGOÀI.
# Đăng ký trần body trước CORS => CORS ở ngoài => phản hồi 413 vẫn được gắn header
# CORS, nhờ đó browser hiện đúng "413" thay vì một lỗi CORS mờ mịt. CORSMiddleware
# không đọc body nên để nó ở ngoài không tốn bộ nhớ.
app.add_middleware(MaxBodySizeMiddleware, max_bytes=settings.max_request_bytes)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(admin_router)
app.include_router(auth_router)
app.include_router(grammar_router)
app.include_router(leaderboard_router)
app.include_router(quiz_router)
app.include_router(custom_vocab_router)
app.include_router(tts_router)
app.include_router(speech_router)
app.include_router(translation_router)
app.include_router(words_router)


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
    """Nạp bộ từ vựng HSK 1-6 đầy đủ (words_export.json) nếu DB còn thiếu.

    Nguồn sự thật là ``backend/app/data/words_export.json`` (5.7k từ HSK 3.0 đã
    dịch tiếng Việt), commit trong repo. ``load_words`` idempotent theo
    (hanzi, hsk_level) nên chạy mỗi lần khởi động cũng an toàn; chỉ bỏ qua khi DB
    đã đủ từ để tránh quét thừa. dev.db bị gitignore nên đây là kênh đưa dữ liệu
    lên Postgres prod."""
    with SessionLocal() as db:
        from sqlalchemy import func, select
        from .models import Word
        word_count = db.scalar(select(func.count()).select_from(Word)) or 0
    if word_count >= 5000:
        return
    from .scripts.load_words import load
    load(overwrite=False)


@app.on_event("startup")
def startup() -> None:
    # KHÔNG chạm DB đồng bộ ở đây. init_db() phải kết nối Postgres; nếu
    # DATABASE_URL sai/không tới được, lệnh đó treo -> uvicorn không mở cổng
    # -> mọi request timeout (000). Đẩy TẤT CẢ sang thread nền để cổng mở
    # ngay; /health tự báo db_connected=false nếu DB chưa sẵn sàng.
    threading.Thread(target=_warm_up_data, name="warm-up-data", daemon=True).start()
    # Luồng hâm socket TTS. Nó KHÔNG mở kết nối nào cho tới khi có request
    # /tts/stream đầu tiên (xem ``tts_socket_pool.note_demand``), nên khởi động ở
    # đây không tốn gì trên một máy đang không có ai gọi.
    tts_socket_pool.start()


@app.on_event("shutdown")
def shutdown() -> None:
    # Đóng socket đang hâm. Không có bước này thì mỗi lần fly deploy sẽ để lại một
    # kết nối treo phía StepFun cho tới khi họ tự dọn.
    tts_socket_pool.shutdown()


def _warm_up_data() -> None:
    """Tạo bảng (nhẹ) ở thread nền. Phần seed/import/pregenerate NẶNG chỉ chạy
    khi bật RUN_SEED=1 — trên free tier 512MB, seed 1825 từ + 720 câu hỏi làm
    OOM -> bị kill -> restart liên tục -> request luôn 000 dù dashboard báo Live.
    Các endpoint hub mới (/draft/*, /save) gọi thẳng LLM, không cần seed.

    RUN_VOCAB_LOAD=1 (không bật RUN_SEED): chỉ nạp bộ từ HSK 1-6 từ
    words_export.json (nhẹ), bỏ qua pregenerate — dùng để đưa từ vựng lên prod
    an toàn. Bật xong nên TẮT lại để lần khởi động sau không quét thừa."""
    try:
        init_db()
    except Exception:
        logger.exception("init_db failed")
        return  # không có bảng thì các bước sau vô nghĩa

    def _flag(name: str) -> bool:
        return os.getenv(name, "").strip() in ("1", "true", "True")

    # Nạp từ vựng (nhẹ: ~5.7k INSERT từ words_export.json, KHÔNG sinh câu hỏi)
    # tách riêng khỏi RUN_SEED. Trên free tier 512MB, chỉ cần RUN_VOCAB_LOAD=1 để
    # đưa bộ từ HSK 1-6 lên prod mà KHÔNG kích hoạt pregenerate_questions (nặng,
    # dễ OOM với 5.7k từ). RUN_SEED vẫn kéo theo cả pregenerate như cũ.
    if _flag("RUN_VOCAB_LOAD") and not _flag("RUN_SEED"):
        try:
            _ensure_vocab()
        except Exception:
            logger.exception("ensure_vocab failed")
        return

    if not _flag("RUN_SEED"):
        logger.info("RUN_SEED/RUN_VOCAB_LOAD không bật -> bỏ qua seed nặng (tránh OOM free tier).")
        return

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
        # Cache + socket hâm sẵn của TTS. Cả hai chỉ sống trong RAM của tiến trình
        # nên không có cách nào khác để biết chúng có thật sự phục vụ hay không:
        # nếu ``served`` đứng ở 0 trong lúc có người gọi thì luồng hâm đã chết,
        # và độ trễ mỗi câu âm thầm quay về mức chưa tối ưu.
        "tts_cache": tts_cache.stats(),
        "tts_socket_pool": tts_socket_pool.stats(),
        "server_time": datetime.now(timezone.utc).isoformat(),
    }
