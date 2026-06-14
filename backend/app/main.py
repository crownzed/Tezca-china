from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select

from .db import SessionLocal, init_db
from .models import Word
from .routers.auth import router as auth_router
from .routers.leaderboard import router as leaderboard_router
from .routers.quiz import router as quiz_router
from .settings import settings

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


def _seed_if_empty() -> None:
    with SessionLocal() as db:
        count = db.scalar(select(func.count()).select_from(Word)) or 0
        if count > 0:
            return
        from .scripts.seed import seed_examples, seed_hsk_examples, seed_words

        seed_words(db)
        seed_hsk_examples(db)
        seed_examples(db)


@app.on_event("startup")
def startup() -> None:
    init_db()
    _seed_if_empty()


@app.get("/health")
def health():
    return {"status": "ok"}
