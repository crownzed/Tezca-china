import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import Float, Integer, String, func, select
from sqlalchemy.orm import Session

from ..deps import resolve_user_id
from ..db import get_db
from ..models import LearningEvent, Question, QuizAttempt, QuizType, UserProgress, Word
from ..schemas import AnalyticsOut, QuizOut, QuizStartRequest, QuizSubmitRequest, QuizSubmitResponse, QuestionOut, QuestionWordOut, SessionCompleteOut, SessionCompleteRequest, SessionEventOut, SessionEventRequest, SessionOutputOut, SessionOutputRequest, SessionStartOut, SessionStartRequest, StatsOut, StudyAnalysisOut, TodaySessionOut
from ..services.output_service import OutputService
from ..services.quiz_service import QuizService
from ..services.rate_limiter import RateLimiter
from ..services.session_service import SessionService
from ..services.study_analysis_service import analyze_study_data

router = APIRouter(prefix="/api", tags=["quiz"])
logger = logging.getLogger(__name__)

# Phân tích AI đốt quota LLM mỗi lần gọi — giới hạn theo user (nút on-demand,
# 6 lần/giờ là dư cho nhu cầu thật, chặn spam bấm liên tục).
_analysis_limiter = RateLimiter(max_hits=6, window_seconds=3600)


def _enforce(limiter: RateLimiter, key: str) -> None:
    if not limiter.allow(key):
        raise HTTPException(status_code=429, detail="Quá nhiều yêu cầu, vui lòng thử lại sau.")

TYPE_LABELS = {
    QuizType.vocab: "Từ vựng",
    QuizType.listening: "Nghe",
    QuizType.dialogue: "Hội thoại",
    QuizType.reading: "Đọc hiểu",
    QuizType.translation: "Dịch đoạn",
    QuizType.cloze: "Điền từ",
    QuizType.drag_drop: "Sắp xếp câu",
    QuizType.voice: "Phát âm",
    QuizType.error_fix: "Sửa lỗi sai",
    QuizType.matching: "Nối từ",
    QuizType.reading_comp: "Đọc hiểu sâu",
}


def _question_out(q) -> QuestionOut:
    """Serialize câu hỏi kèm metadata trực quan của từ mục tiêu.

    ``model_validate(from_attributes=True)`` không map các cột ``*_json``
    (confusable_words_json -> confusable_words), nên ``word`` được dựng
    thủ công qua ``QuestionWordOut.from_word``.
    """
    out = QuestionOut.model_validate(q, from_attributes=True)
    out.word = QuestionWordOut.from_word(getattr(q, "word", None))
    if out.metadata_json is None:
        out.metadata_json = {}
    return out


@router.post("/quiz", response_model=QuizOut)
def start_quiz(payload: QuizStartRequest, user_id: str = Depends(resolve_user_id), db: Session = Depends(get_db)):
    questions = QuizService(db).get_quiz(user_id, payload.level, payload.quiz_type, payload.limit)
    return QuizOut(questions=[_question_out(q) for q in questions])


@router.post("/quiz/submit", response_model=QuizSubmitResponse)
def submit_quiz(payload: QuizSubmitRequest, user_id: str = Depends(resolve_user_id), db: Session = Depends(get_db)):
    payload.user_id = user_id
    return QuizService(db).submit(payload)


def _parse_topics(topics: str | None) -> list[str] | None:
    if not topics:
        return None
    parsed = [t.strip() for t in topics.split(",") if t.strip()]
    return parsed or None

def _today_plan(db: Session, user_id: str, focus_level: int, mode: str, learning_mode: str, topics: str | None) -> dict:
    """Thân chung cho /session/today và /recommendation (cùng một kế hoạch)."""
    return SessionService(db).today(
        user_id=user_id,
        focus_level=focus_level,
        mode=mode,
        learning_mode=learning_mode,
        topics=_parse_topics(topics),
    )

@router.get("/session/today", response_model=TodaySessionOut)
def today_session(user_id: str = Depends(resolve_user_id), focus_level: int = 1, mode: str = "standard", learning_mode: str = "hsk", topics: str | None = None, db: Session = Depends(get_db)):
    return _today_plan(db, user_id, focus_level, mode, learning_mode, topics)

@router.get("/recommendation", response_model=TodaySessionOut)
def recommendation(user_id: str = Depends(resolve_user_id), focus_level: int = 1, mode: str = "standard", learning_mode: str = "hsk", topics: str | None = None, db: Session = Depends(get_db)):
    return _today_plan(db, user_id, focus_level, mode, learning_mode, topics)

@router.post("/session/start", response_model=SessionStartOut)
def start_session(payload: SessionStartRequest, user_id: str = Depends(resolve_user_id), db: Session = Depends(get_db)):
    session = SessionService(db).start(
        user_id=user_id,
        session_type=payload.session_type,
        behavior_state=payload.behavior_state,
        estimated_minutes=payload.estimated_minutes,
        target_words_json=payload.target_words_json,
        target_skills_json=payload.target_skills_json,
        reason=payload.reason,
    )
    return {
        "id": session.id,
        "user_id": session.user_id,
        "session_type": session.session_type,
        "behavior_state": session.behavior_state,
        "estimated_minutes": session.estimated_minutes,
        "reason": session.reason,
    }

@router.post("/session/event", response_model=SessionEventOut)
def record_session_event(payload: SessionEventRequest, user_id: str = Depends(resolve_user_id), db: Session = Depends(get_db)):
    try:
        return SessionService(db).record_event(
            user_id=user_id,
            question_id=payload.question_id,
            selected_index=payload.selected_index,
            confidence=payload.confidence,
            latency_ms=payload.latency_ms,
            error_tag=payload.error_tag,
            session_id=payload.session_id,
            item_type=payload.item_type,
        )
    except ValueError as exc:
        if str(exc) == "question_not_found":
            raise HTTPException(status_code=404, detail="Question not found") from exc
        raise

@router.post("/session/complete", response_model=SessionCompleteOut)
def complete_session(payload: SessionCompleteRequest, user_id: str = Depends(resolve_user_id), db: Session = Depends(get_db)):
    try:
        session = SessionService(db).complete(user_id=user_id, session_id=payload.session_id)
    except ValueError as exc:
        if str(exc) == "session_not_found":
            raise HTTPException(status_code=404, detail="Session not found") from exc
        raise
    return {"id": session.id, "completed_at": session.completed_at.isoformat()}

@router.post("/session/output", response_model=SessionOutputOut)
def submit_session_output(payload: SessionOutputRequest, user_id: str = Depends(resolve_user_id), db: Session = Depends(get_db)):
    return OutputService(db).submit(
        user_id=user_id,
        session_id=payload.session_id,
        word_id=payload.word_id,
        target_word=payload.target_word,
        prompt=payload.prompt,
        response_text=payload.response_text,
        typing_detail=payload.typing_detail,
    )


@router.get("/stats", response_model=StatsOut)
def stats(user_id: str = Depends(resolve_user_id), db: Session = Depends(get_db)):
    """Thống kê tóm tắt — TẤT CẢ tính bằng SQL aggregate, KHÔNG load ORM rows.

    Bản cũ load TRỌN UserProgress vào RAM rồi sum/len trong Python. Với user có
    vài nghìn từ đã học, việc đó tốn hàng chục ms serialize + transfer + iterate.
    Chuyển sang SUM/COUNT/AVG trực tiếp trên DB: một query duy nhất, kết quả là
    5 con số thay vì nghìn hàng ORM.
    """
    attempts = db.scalar(select(func.count()).select_from(QuizAttempt).where(QuizAttempt.user_id == user_id)) or 0

    # Một query aggregate duy nhất thay vì load toàn bộ progress rows.
    # CASE expression cho weak count: seen > 0 AND accuracy < 60%.
    agg = db.execute(
        select(
            func.coalesce(func.sum(UserProgress.seen), 0).label("answered"),
            func.coalesce(func.sum(UserProgress.correct), 0).label("correct"),
            func.coalesce(func.avg(UserProgress.mastery), 0).label("mastery_avg"),
            func.count().label("total_rows"),
            func.sum(
                func.cast(
                    (UserProgress.seen > 0) & (UserProgress.correct * 100 < UserProgress.seen * 60),
                    Integer,
                )
            ).label("weak"),
        ).where(UserProgress.user_id == user_id)
    ).one()

    answered = int(agg.answered)
    correct = int(agg.correct)
    mastery_avg = round(float(agg.mastery_avg)) if agg.total_rows else 0
    weak = int(agg.weak or 0)
    accuracy = round((correct / answered) * 100) if answered else 0
    label = "Bền vững" if mastery_avg >= 80 else "Ổn định" if mastery_avg >= 55 else "Đang xây" if mastery_avg else "Khởi động"
    return StatsOut(attempts=attempts, answered=answered, accuracy=accuracy, mastery_label=label, weak_words=weak)

@router.get("/analytics", response_model=AnalyticsOut)
def analytics(user_id: str = Depends(resolve_user_id), db: Session = Depends(get_db)):
    """Phân tích học tập chi tiết — tối ưu bằng SQL aggregation.

    Bản cũ load TRỌN 3 bảng (QuizAttempt, UserProgress, LearningEvent+Question)
    vào RAM rồi iterate trong Python. Với user active (10k+ events), việc đó vượt
    p95 < 200ms rất xa. Chuyển sang:
      - Progress aggregates: 1 query SUM/COUNT/AVG (thay vì load nghìn ORM rows)
      - Event aggregates: GROUP BY trên DB cho type/level breakdown + confidence/latency
      - Weak words: ORDER BY + LIMIT 6 trên DB (thay vì sort toàn bộ trong Python)
      - Recent trend: subquery GROUP BY session_id rồi LIMIT 8 (thay vì load all events)
      - Type/level breakdown: GROUP BY trực tiếp (thay vì iterate all events)
    Fallback QuizAttempt chỉ khi KHÔNG có event nào (user cũ chưa migrate sang event).
    """
    now = datetime.utcnow()

    # --- 1. Progress aggregates (1 query thay vì load all rows) ----------------
    prog_agg = db.execute(
        select(
            func.coalesce(func.sum(UserProgress.seen), 0).label("answered"),
            func.coalesce(func.sum(UserProgress.correct), 0).label("correct"),
            func.coalesce(func.avg(UserProgress.mastery), 0).label("mastery_avg"),
            func.coalesce(func.avg(UserProgress.listening_score), 0).label("listening_avg"),
            func.coalesce(func.avg(UserProgress.context_score), 0).label("context_avg"),
            func.coalesce(func.avg(UserProgress.production_score), 0).label("production_avg"),
            func.count().label("total_rows"),
            func.sum(
                func.cast(
                    (UserProgress.seen > 0) & (UserProgress.correct * 100 < UserProgress.seen * 60),
                    Integer,
                )
            ).label("weak"),
            func.sum(
                func.cast(
                    (UserProgress.seen > 0) & (
                        (UserProgress.next_review_at.is_(None)) | (UserProgress.next_review_at <= now)
                    ),
                    Integer,
                )
            ).label("due_count"),
        ).where(UserProgress.user_id == user_id)
    ).one()

    answered = int(prog_agg.answered)
    correct = int(prog_agg.correct)
    weak = int(prog_agg.weak or 0)
    due_count = int(prog_agg.due_count or 0)
    mastery_avg = round(float(prog_agg.mastery_avg)) if prog_agg.total_rows else 0
    memory_stability = mastery_avg
    listening_readiness = round(float(prog_agg.listening_avg)) if prog_agg.total_rows else 0
    context_transfer = round(float(prog_agg.context_avg)) if prog_agg.total_rows else 0
    production_readiness = round(float(prog_agg.production_avg)) if prog_agg.total_rows else 0
    accuracy = round((correct / answered) * 100) if answered else 0
    label = "Bền vững" if mastery_avg >= 80 else "Ổn định" if mastery_avg >= 55 else "Đang xây" if mastery_avg else "Khởi động"

    # --- 2. Event-level aggregates (GROUP BY thay vì iterate all rows) ----------
    # Confidence + latency averages
    event_avgs = db.execute(
        select(
            func.avg(LearningEvent.confidence).label("confidence_avg"),
            func.avg(LearningEvent.latency_ms).label("latency_avg"),
            func.count().label("event_count"),
        ).where(LearningEvent.user_id == user_id)
    ).one()
    confidence_avg = round(float(event_avgs.confidence_avg), 2) if event_avgs.confidence_avg else 0
    latency_avg_ms = round(float(event_avgs.latency_avg)) if event_avgs.latency_avg else 0
    event_count = int(event_avgs.event_count)

    # Type breakdown via GROUP BY (1 query thay vì iterate all events)
    type_rows = db.execute(
        select(
            Question.quiz_type,
            func.count(func.distinct(LearningEvent.session_id)).label("attempts"),
            func.count().label("answered"),
            func.sum(LearningEvent.correct).label("correct"),
        )
        .join(Question, LearningEvent.question_id == Question.id)
        .where(LearningEvent.user_id == user_id)
        .group_by(Question.quiz_type)
    ).all()
    type_map = {
        quiz_type: {"quiz_type": quiz_type, "label": TYPE_LABELS[quiz_type], "attempts": 0, "answered": 0, "correct": 0}
        for quiz_type in QuizType
    }
    for row in type_rows:
        item = type_map[row.quiz_type]
        # session_id NULL → mỗi event là một "session" riêng (fallback cho data cũ)
        # count(distinct session_id) bỏ qua NULL → cần cộng thêm số event có session_id NULL
        item["attempts"] = row.attempts
        item["answered"] = row.answered
        item["correct"] = int(row.correct or 0)

    # Fix attempts count: distinct(session_id) ignores NULLs; add back NULL-session events
    null_session_attempts = db.execute(
        select(
            Question.quiz_type,
            func.count().label("null_sessions"),
        )
        .join(Question, LearningEvent.question_id == Question.id)
        .where(LearningEvent.user_id == user_id, LearningEvent.session_id.is_(None))
        .group_by(Question.quiz_type)
    ).all()
    for row in null_session_attempts:
        type_map[row.quiz_type]["attempts"] += row.null_sessions

    # Level breakdown via GROUP BY
    level_rows = db.execute(
        select(
            Question.level,
            func.count(func.distinct(LearningEvent.session_id)).label("attempts"),
            func.count().label("answered"),
            func.sum(LearningEvent.correct).label("correct"),
        )
        .join(Question, LearningEvent.question_id == Question.id)
        .where(LearningEvent.user_id == user_id)
        .group_by(Question.level)
    ).all()
    level_map = {level: {"level": level, "attempts": 0, "answered": 0, "correct": 0} for level in range(1, 7)}
    for row in level_rows:
        if row.level in level_map:
            item = level_map[row.level]
            item["attempts"] = row.attempts
            item["answered"] = row.answered
            item["correct"] = int(row.correct or 0)

    # Fix NULL-session attempts for level
    null_session_levels = db.execute(
        select(
            Question.level,
            func.count().label("null_sessions"),
        )
        .join(Question, LearningEvent.question_id == Question.id)
        .where(LearningEvent.user_id == user_id, LearningEvent.session_id.is_(None))
        .group_by(Question.level)
    ).all()
    for row in null_session_levels:
        if row.level in level_map:
            level_map[row.level]["attempts"] += row.null_sessions

    has_events = event_count > 0

    # Fallback: nếu không có event nào, dùng QuizAttempt (data cũ trước khi migrate)
    if not has_events:
        attempt_rows = db.execute(
            select(
                QuizAttempt.quiz_type,
                func.count().label("attempts"),
                func.sum(QuizAttempt.total).label("answered"),
                func.sum(QuizAttempt.score).label("correct"),
            )
            .where(QuizAttempt.user_id == user_id)
            .group_by(QuizAttempt.quiz_type)
        ).all()
        for row in attempt_rows:
            item = type_map[row.quiz_type]
            item["attempts"] = row.attempts
            item["answered"] = int(row.answered or 0)
            item["correct"] = int(row.correct or 0)

        level_attempt_rows = db.execute(
            select(
                QuizAttempt.level,
                func.count().label("attempts"),
                func.sum(QuizAttempt.total).label("answered"),
                func.sum(QuizAttempt.score).label("correct"),
            )
            .where(QuizAttempt.user_id == user_id)
            .group_by(QuizAttempt.level)
        ).all()
        for row in level_attempt_rows:
            if row.level in level_map:
                item = level_map[row.level]
                item["attempts"] = row.attempts
                item["answered"] = int(row.answered or 0)
                item["correct"] = int(row.correct or 0)

    type_breakdown = [
        {**item, "accuracy": round((item["correct"] / item["answered"]) * 100) if item["answered"] else 0}
        for item in type_map.values()
    ]
    level_breakdown = [
        {**item, "accuracy": round((item["correct"] / item["answered"]) * 100) if item["answered"] else 0}
        for item in level_map.values()
    ]

    # --- 3. Recent trend: GROUP BY session trên DB, LIMIT 8 ---------------------
    if has_events:
        # Subquery: aggregate per session (or per event if no session_id)
        # Dùng COALESCE(session_id, 'event-' || id) làm group key
        from sqlalchemy import case as sa_case
        group_key = sa_case(
            (LearningEvent.session_id.is_not(None), func.cast(LearningEvent.session_id, String)),
            else_=func.concat("event-", func.cast(LearningEvent.id, String)),
        ).label("gk")
        recent_subq = (
            select(
                group_key,
                func.min(LearningEvent.created_at).label("first_at"),
                func.min(Question.level).label("level"),
                func.min(Question.quiz_type).label("quiz_type"),
                func.sum(LearningEvent.correct).label("score"),
                func.count().label("total"),
            )
            .join(Question, LearningEvent.question_id == Question.id)
            .where(LearningEvent.user_id == user_id)
            .group_by(group_key)
            .order_by(func.min(LearningEvent.created_at).desc())
            .limit(8)
        ).subquery()
        recent_rows = db.execute(
            select(recent_subq).order_by(recent_subq.c.first_at.asc())
        ).all()
        total_groups = db.scalar(
            select(func.count(func.distinct(group_key)))
            .select_from(LearningEvent)
            .join(Question, LearningEvent.question_id == Question.id)
            .where(LearningEvent.user_id == user_id)
        ) or 0
        first_recent_index = max(0, total_groups - len(recent_rows))
        recent_trend = [
            {
                "label": f"S{first_recent_index + idx + 1}",
                "level": row.level,
                "quiz_type": row.quiz_type,
                "score": int(row.score or 0),
                "total": int(row.total),
                "accuracy": round((int(row.score or 0) / int(row.total)) * 100) if row.total else 0,
            }
            for idx, row in enumerate(recent_rows)
        ]
        attempt_count = total_groups
    else:
        # Fallback: QuizAttempt gần nhất
        recent_attempts = db.scalars(
            select(QuizAttempt)
            .where(QuizAttempt.user_id == user_id)
            .order_by(QuizAttempt.created_at.desc())
            .limit(8)
        ).all()
        total_attempts = db.scalar(
            select(func.count()).select_from(QuizAttempt).where(QuizAttempt.user_id == user_id)
        ) or 0
        recent_attempts = list(reversed(recent_attempts))
        first_recent_index = max(0, total_attempts - len(recent_attempts))
        recent_trend = [
            {
                "label": f"P{first_recent_index + idx + 1}",
                "level": a.level,
                "quiz_type": a.quiz_type,
                "score": a.score,
                "total": a.total,
                "accuracy": round((a.score / a.total) * 100) if a.total else 0,
            }
            for idx, a in enumerate(recent_attempts)
        ]
        attempt_count = total_attempts

    # --- 4. Weak words: ORDER BY + LIMIT trên DB (thay vì sort toàn bộ) --------
    weak_word_rows = db.execute(
        select(
            Word.hsk_level,
            Word.hanzi,
            Word.pinyin,
            Word.meaning_vi,
            UserProgress.seen,
            UserProgress.wrong,
            UserProgress.mastery,
            (UserProgress.correct * 100 / func.cast(UserProgress.seen, Float)).label("word_accuracy"),
        )
        .join(Word, UserProgress.word_id == Word.id)
        .where(UserProgress.user_id == user_id, UserProgress.seen > 0)
        .order_by(
            (UserProgress.correct * 100 / func.cast(UserProgress.seen, Float)).asc(),
            UserProgress.mastery.asc(),
            UserProgress.wrong.desc(),
            UserProgress.seen.desc(),
        )
        .limit(6)
    ).all()
    weak_word_list = [
        {
            "level": row.hsk_level,
            "hanzi": row.hanzi,
            "pinyin": row.pinyin,
            "meaning_vi": row.meaning_vi,
            "seen": row.seen,
            "wrong": row.wrong,
            "accuracy": round(float(row.word_accuracy)) if row.word_accuracy is not None else 0,
            "mastery": row.mastery,
        }
        for row in weak_word_rows
    ]

    # --- 5. Recommendation logic (giữ nguyên, chỉ dùng biến đã aggregate) ------
    practiced_types = [item for item in type_breakdown if item["answered"] > 0]
    practiced_levels = [item for item in level_breakdown if item["answered"] > 0]
    weakest_type = min(practiced_types, key=lambda item: (item["accuracy"], -item["answered"])) if practiced_types else None
    weakest_level = min(practiced_levels, key=lambda item: (item["accuracy"], -item["answered"])) if practiced_levels else None

    if weak or due_count or (confidence_avg and confidence_avg < 2.5):
        recommended_strategy = "repair"
    elif has_events and accuracy >= 70 and len(practiced_types) >= 2:
        recommended_strategy = "interleaved"
    else:
        recommended_strategy = "targeted"

    if weak_word_list:
        recommended_level = weak_word_list[0]["level"]
        if weakest_type and weakest_type["accuracy"] < 72:
            recommended_type = weakest_type["quiz_type"]
        elif listening_readiness and listening_readiness < max(memory_stability - 15, 55):
            recommended_type = QuizType.listening
        elif context_transfer and context_transfer < max(memory_stability - 15, 55):
            recommended_type = QuizType.cloze
        else:
            recommended_type = QuizType.vocab
        focus_words = [item["hanzi"] for item in weak_word_list[:4]]
        reason = f"Nhóm từ {', '.join(focus_words)} đang yếu hoặc đến hạn; đề xuất dùng {TYPE_LABELS[recommended_type]} với chiến lược {recommended_strategy}."
    elif weakest_type and weakest_level:
        recommended_level = weakest_level["level"]
        recommended_type = weakest_type["quiz_type"]
        focus_words = []
        reason = f"Dạng {weakest_type['label']} tại HSK {recommended_level} thấp nhất trong event log gần đây."
    else:
        recommended_level = 1
        recommended_type = QuizType.vocab
        focus_words = []
        reason = "Chưa đủ event học, nên bắt đầu bằng từ vựng HSK 1 để tạo đường chuẩn."

    return AnalyticsOut(
        attempts=attempt_count,
        answered=answered,
        accuracy=accuracy,
        mastery_label=label,
        weak_words=weak,
        memory_stability=memory_stability,
        listening_readiness=listening_readiness,
        context_transfer=context_transfer,
        production_readiness=production_readiness,
        event_count=event_count,
        due_count=due_count,
        confidence_avg=confidence_avg,
        latency_avg_ms=latency_avg_ms,
        type_breakdown=type_breakdown,
        level_breakdown=level_breakdown,
        recent_trend=recent_trend,
        weak_word_list=weak_word_list,
        recommendation={
            "level": recommended_level,
            "quiz_type": recommended_type,
            "title": f"HSK {recommended_level} · {TYPE_LABELS[recommended_type]}",
            "reason": reason,
            "target_accuracy": 80,
            "focus_words": focus_words,
            "recommended_strategy": recommended_strategy,
        },
    )


@router.post("/analysis", response_model=StudyAnalysisOut)
def study_analysis(user_id: str = Depends(resolve_user_id), db: Session = Depends(get_db)):
    """AI phân tích dữ liệu học tổng hợp (on-demand). Gom lại chính AnalyticsOut
    mà /api/analytics sinh ra rồi nhờ LLM viết nhận xét + lộ trình tiếng Việt.

    Rate-limit theo user vì mỗi lần đốt quota LLM. Lỗi LLM -> 424 (KHÔNG dùng 502):
    frontend gọi endpoint này với retryable=true để cầm cự cold-start, mà request()
    lại retry mọi 502/503/504. Nếu lỗi LLM trả 502 thì 1 lần bấm hỏng sẽ retry 5 lần
    → đốt 5 token rate-limit (chỉ có 6/giờ) + 5 lượt gọi LLM. Dùng 424 (Failed
    Dependency) để tách lỗi LLM khỏi tập cold-start, retry không kích hoạt."""
    _enforce(_analysis_limiter, user_id)
    analytics_out = analytics(user_id=user_id, db=db)
    try:
        result = analyze_study_data(db, user_id, analytics_out.model_dump())
        return StudyAnalysisOut(**result)
    except RuntimeError as e:
        logger.warning("Study analysis failed for %s: %s", user_id, e)
        raise HTTPException(status_code=424, detail="AI phân tích tạm thời không khả dụng, thử lại sau.")
