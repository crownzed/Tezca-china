from datetime import datetime
from enum import Enum

from sqlalchemy import JSON, Boolean, DateTime, Enum as SqlEnum, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    display_name: Mapped[str] = mapped_column(String(64))
    leaderboard_opt_in: Mapped[bool] = mapped_column(Boolean, default=True)
    # Admin khóa/mở tài khoản. False = bị khóa: login bị chặn (xem AuthService.login).
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    # user_id là String thường (không FK) — nhất quán với các bảng học khác;
    # dọn tay trong AuthService.delete_account.
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    # Chỉ lưu SHA-256 của token, không bao giờ lưu token thô. Link gửi qua email
    # chứa token thô; DB chỉ giữ hash để đối chiếu, rò rỉ DB không lộ được link.
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class QuizType(str, Enum):
    vocab = "vocab"
    listening = "listening"
    reading = "reading"
    translation = "translation"
    cloze = "cloze"
    dialogue = "dialogue"
    drag_drop = "drag_drop"  # Kéo thả sắp xếp từ thành câu
    voice = "voice"  # Ghi âm phát âm
    error_fix = "error_fix"  # Tìm và sửa lỗi sai ngữ pháp
    matching = "matching"  # Nối từ Trung-Việt / Trung-Pinyin
    reading_comp = "reading_comp"  # Đọc hiểu đoạn văn dài + câu hỏi phụ


class Word(Base):
    __tablename__ = "words"

    id: Mapped[int] = mapped_column(primary_key=True)
    hanzi: Mapped[str] = mapped_column(String(32), index=True)
    pinyin: Mapped[str] = mapped_column(String(128), default="")
    meaning_vi: Mapped[str] = mapped_column(Text, default="")
    meaning_en: Mapped[str] = mapped_column(Text, default="")
    hsk_level: Mapped[int] = mapped_column(Integer, index=True)
    source: Mapped[str] = mapped_column(String(64), default="seed")
    tone_pattern: Mapped[str] = mapped_column(String(32), default="")
    character_family: Mapped[str] = mapped_column(String(32), default="")
    component_hint: Mapped[str] = mapped_column(Text, default="")
    collocations_json: Mapped[list[str]] = mapped_column(JSON, default=list)
    confusable_words_json: Mapped[list[str]] = mapped_column(JSON, default=list)
    topic: Mapped[str] = mapped_column(String(64), default="core")
    frequency_band: Mapped[str] = mapped_column(String(32), default="core_hsk")
    pos: Mapped[str] = mapped_column(String(16), default="")

    examples: Mapped[list["Example"]] = relationship(back_populates="word", cascade="all, delete-orphan")

    __table_args__ = (UniqueConstraint("hanzi", "hsk_level", name="uq_word_hanzi_hsk"),)


class Example(Base):
    __tablename__ = "examples"

    id: Mapped[int] = mapped_column(primary_key=True)
    word_id: Mapped[int] = mapped_column(ForeignKey("words.id"), index=True)
    sentence_cn: Mapped[str] = mapped_column(Text)
    sentence_vi: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(String(64), default="tatoeba", index=True)

    word: Mapped[Word] = relationship(back_populates="examples")


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[int] = mapped_column(primary_key=True)
    word_id: Mapped[int | None] = mapped_column(ForeignKey("words.id"), nullable=True, index=True)
    level: Mapped[int] = mapped_column(Integer, index=True)
    quiz_type: Mapped[QuizType] = mapped_column(SqlEnum(QuizType), index=True)
    prompt: Mapped[str] = mapped_column(Text)
    options: Mapped[list[str]] = mapped_column(JSON)
    correct_index: Mapped[int] = mapped_column(Integer)
    explanation: Mapped[str] = mapped_column(Text, default="")
    audio_text: Mapped[str] = mapped_column(Text, default="")
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    word: Mapped[Word | None] = relationship()

    __table_args__ = (
        UniqueConstraint("word_id", "quiz_type", "prompt", name="uq_question_word_type_prompt"),
        Index("ix_questions_level_type_created", "level", "quiz_type", "created_at"),
    )


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    level: Mapped[int] = mapped_column(Integer, index=True)
    quiz_type: Mapped[QuizType] = mapped_column(SqlEnum(QuizType), index=True)
    score: Mapped[int] = mapped_column(Integer)
    total: Mapped[int] = mapped_column(Integer)
    answers: Mapped[list[dict]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_quiz_attempts_user_level_type_created", "user_id", "level", "quiz_type", "created_at"),
        Index("ix_quiz_attempts_user_created", "user_id", "created_at"),
    )


class LearningSession(Base):
    __tablename__ = "learning_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    behavior_state: Mapped[str] = mapped_column(String(32), default="maintenance")
    session_type: Mapped[str] = mapped_column(String(32), default="standard")
    estimated_minutes: Mapped[int] = mapped_column(Integer, default=20)
    target_words_json: Mapped[list[dict]] = mapped_column(JSON, default=list)
    target_skills_json: Mapped[list[str]] = mapped_column(JSON, default=list)
    reason: Mapped[str] = mapped_column(Text, default="")
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class LearningEvent(Base):
    __tablename__ = "learning_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    word_id: Mapped[int | None] = mapped_column(ForeignKey("words.id"), nullable=True, index=True)
    question_id: Mapped[int | None] = mapped_column(ForeignKey("questions.id"), nullable=True, index=True)
    session_id: Mapped[int | None] = mapped_column(ForeignKey("learning_sessions.id"), nullable=True, index=True)
    item_type: Mapped[str] = mapped_column(String(48), default="quiz")
    skill: Mapped[str] = mapped_column(String(48), default="recognition")
    prompt_modality: Mapped[str] = mapped_column(String(48), default="text")
    response_modality: Mapped[str] = mapped_column(String(48), default="choice")
    correct: Mapped[int] = mapped_column(Integer, default=0)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    confidence: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_tag: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class UserProgress(Base):
    __tablename__ = "user_progress"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    word_id: Mapped[int] = mapped_column(ForeignKey("words.id"), index=True)
    seen: Mapped[int] = mapped_column(Integer, default=0)
    correct: Mapped[int] = mapped_column(Integer, default=0)
    wrong: Mapped[int] = mapped_column(Integer, default=0)
    mastery: Mapped[int] = mapped_column(Integer, default=0)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    ease: Mapped[float] = mapped_column(Float, default=2.5)
    interval_days: Mapped[int] = mapped_column(Integer, default=0)
    repetition: Mapped[int] = mapped_column(Integer, default=0)
    lapses: Mapped[int] = mapped_column(Integer, default=0)
    next_review_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    recognition_score: Mapped[int] = mapped_column(Integer, default=0)
    listening_score: Mapped[int] = mapped_column(Integer, default=0)
    context_score: Mapped[int] = mapped_column(Integer, default=0)
    production_score: Mapped[int] = mapped_column(Integer, default=0)
    confidence_avg: Mapped[float] = mapped_column(Float, default=0)
    latency_avg: Mapped[int] = mapped_column(Integer, default=0)
    error_json: Mapped[dict] = mapped_column(JSON, default=dict)

    __table_args__ = (UniqueConstraint("user_id", "word_id", name="uq_progress_user_word"),)
