from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..deps import resolve_user_id
from ..db import get_db
from ..models import LearningEvent, Question, QuizAttempt, QuizType, UserProgress, Word
from ..schemas import AnalyticsOut, QuizOut, QuizStartRequest, QuizSubmitRequest, QuizSubmitResponse, QuestionOut, QuestionWordOut, SessionCompleteOut, SessionCompleteRequest, SessionEventOut, SessionEventRequest, SessionOutputOut, SessionOutputRequest, SessionStartOut, SessionStartRequest, StatsOut, TodaySessionOut
from ..services.output_service import OutputService
from ..services.quiz_service import QuizService
from ..services.session_service import SessionService

router = APIRouter(prefix="/api", tags=["quiz"])

TYPE_LABELS = {
    QuizType.vocab: "Từ vựng",
    QuizType.listening: "Nghe",
    QuizType.dialogue: "Hội thoại",
    QuizType.reading: "Đọc hiểu",
    QuizType.translation: "Dịch đoạn",
    QuizType.cloze: "Điền từ",
}


def _question_out(q) -> QuestionOut:
    """Serialize câu hỏi kèm metadata trực quan của từ mục tiêu.

    ``model_validate(from_attributes=True)`` không map các cột ``*_json``
    (confusable_words_json -> confusable_words), nên ``word`` được dựng
    thủ công qua ``QuestionWordOut.from_word``.
    """
    out = QuestionOut.model_validate(q, from_attributes=True)
    out.word = QuestionWordOut.from_word(getattr(q, "word", None))
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
    attempts = db.scalar(select(func.count()).select_from(QuizAttempt).where(QuizAttempt.user_id == user_id)) or 0
    progress = db.scalars(select(UserProgress).where(UserProgress.user_id == user_id)).all()
    answered = sum(p.seen for p in progress)
    correct = sum(p.correct for p in progress)
    weak = len([p for p in progress if p.seen > 0 and p.correct / max(1, p.seen) < 0.6])
    accuracy = round((correct / answered) * 100) if answered else 0
    mastery_avg = round(sum(p.mastery for p in progress) / len(progress)) if progress else 0
    memory_stability = mastery_avg
    listening_readiness = round(sum(p.listening_score or 0 for p in progress) / len(progress)) if progress else 0
    context_transfer = round(sum(p.context_score or 0 for p in progress) / len(progress)) if progress else 0
    production_readiness = round(sum(p.production_score or 0 for p in progress) / len(progress)) if progress else 0
    label = "Bền vững" if mastery_avg >= 80 else "Ổn định" if mastery_avg >= 55 else "Đang xây" if mastery_avg else "Khởi động"
    return StatsOut(attempts=attempts, answered=answered, accuracy=accuracy, mastery_label=label, weak_words=weak)

@router.get("/analytics", response_model=AnalyticsOut)
def analytics(user_id: str = Depends(resolve_user_id), db: Session = Depends(get_db)):
    now = datetime.utcnow()
    attempts = db.scalars(
        select(QuizAttempt)
        .where(QuizAttempt.user_id == user_id)
        .order_by(QuizAttempt.created_at.asc())
    ).all()
    progress = db.scalars(select(UserProgress).where(UserProgress.user_id == user_id)).all()
    event_rows = db.execute(
        select(LearningEvent, Question)
        .join(Question, LearningEvent.question_id == Question.id)
        .where(LearningEvent.user_id == user_id)
        .order_by(LearningEvent.created_at.asc())
    ).all()

    answered = sum(p.seen for p in progress)
    correct = sum(p.correct for p in progress)
    weak = len([p for p in progress if p.seen > 0 and p.correct / max(1, p.seen) < 0.6])
    due_count = len([p for p in progress if p.seen > 0 and (p.next_review_at is None or p.next_review_at <= now)])
    accuracy = round((correct / answered) * 100) if answered else 0
    mastery_avg = round(sum(p.mastery for p in progress) / len(progress)) if progress else 0
    memory_stability = mastery_avg
    listening_readiness = round(sum(p.listening_score or 0 for p in progress) / len(progress)) if progress else 0
    context_transfer = round(sum(p.context_score or 0 for p in progress) / len(progress)) if progress else 0
    production_readiness = round(sum(p.production_score or 0 for p in progress) / len(progress)) if progress else 0
    confidence_values = [event.confidence for event, _ in event_rows if event.confidence]
    latency_values = [event.latency_ms for event, _ in event_rows if event.latency_ms is not None]
    confidence_avg = round(sum(confidence_values) / len(confidence_values), 2) if confidence_values else 0
    latency_avg_ms = round(sum(latency_values) / len(latency_values)) if latency_values else 0
    label = "Bền vững" if mastery_avg >= 80 else "Ổn định" if mastery_avg >= 55 else "Đang xây" if mastery_avg else "Khởi động"

    type_map = {
        quiz_type: {
            "quiz_type": quiz_type,
            "label": TYPE_LABELS[quiz_type],
            "attempts": 0,
            "answered": 0,
            "correct": 0,
        }
        for quiz_type in QuizType
    }
    level_map = {
        level: {"level": level, "attempts": 0, "answered": 0, "correct": 0}
        for level in range(1, 7)
    }

    event_groups = {}
    type_sessions = {quiz_type: set() for quiz_type in QuizType}
    level_sessions = {level: set() for level in range(1, 7)}

    if event_rows:
        for event, question in event_rows:
            correct_value = 1 if event.correct else 0
            group_key = event.session_id or f"event-{event.id}"

            type_item = type_map[question.quiz_type]
            type_item["answered"] += 1
            type_item["correct"] += correct_value
            type_sessions[question.quiz_type].add(group_key)

            level_item = level_map[question.level]
            level_item["answered"] += 1
            level_item["correct"] += correct_value
            level_sessions[question.level].add(group_key)

            group = event_groups.setdefault(group_key, {
                "created_at": event.created_at,
                "level": question.level,
                "quiz_type": question.quiz_type,
                "score": 0,
                "total": 0,
            })
            group["score"] += correct_value
            group["total"] += 1
            if event.created_at < group["created_at"]:
                group["created_at"] = event.created_at

        for quiz_type, sessions in type_sessions.items():
            type_map[quiz_type]["attempts"] = len(sessions)
        for level, sessions in level_sessions.items():
            level_map[level]["attempts"] = len(sessions)
    else:
        for attempt in attempts:
            type_item = type_map[attempt.quiz_type]
            type_item["attempts"] += 1
            type_item["answered"] += attempt.total
            type_item["correct"] += attempt.score

            level_item = level_map[attempt.level]
            level_item["attempts"] += 1
            level_item["answered"] += attempt.total
            level_item["correct"] += attempt.score

    type_breakdown = [
        {
            **item,
            "accuracy": round((item["correct"] / item["answered"]) * 100) if item["answered"] else 0,
        }
        for item in type_map.values()
    ]
    level_breakdown = [
        {
            **item,
            "accuracy": round((item["correct"] / item["answered"]) * 100) if item["answered"] else 0,
        }
        for item in level_map.values()
    ]

    if event_rows:
        recent_groups = sorted(event_groups.values(), key=lambda item: item["created_at"])[-8:]
        first_recent_index = max(0, len(event_groups) - len(recent_groups))
        recent_trend = [
            {
                "label": f"S{first_recent_index + idx + 1}",
                "level": group["level"],
                "quiz_type": group["quiz_type"],
                "score": group["score"],
                "total": group["total"],
                "accuracy": round((group["score"] / group["total"]) * 100) if group["total"] else 0,
            }
            for idx, group in enumerate(recent_groups)
        ]
        attempt_count = len(event_groups)
    else:
        recent_attempts = attempts[-8:]
        first_recent_index = max(0, len(attempts) - len(recent_attempts))
        recent_trend = [
            {
                "label": f"P{first_recent_index + idx + 1}",
                "level": attempt.level,
                "quiz_type": attempt.quiz_type,
                "score": attempt.score,
                "total": attempt.total,
                "accuracy": round((attempt.score / attempt.total) * 100) if attempt.total else 0,
            }
            for idx, attempt in enumerate(recent_attempts)
        ]
        attempt_count = len(attempts)

    word_rows = db.execute(
        select(UserProgress, Word)
        .join(Word, UserProgress.word_id == Word.id)
        .where(UserProgress.user_id == user_id, UserProgress.seen > 0)
    ).all()
    weak_word_candidates = []
    for progress_row, word in word_rows:
        word_accuracy = round((progress_row.correct / progress_row.seen) * 100) if progress_row.seen else 0
        weak_word_candidates.append({
            "level": word.hsk_level,
            "hanzi": word.hanzi,
            "pinyin": word.pinyin,
            "meaning_vi": word.meaning_vi,
            "seen": progress_row.seen,
            "wrong": progress_row.wrong,
            "accuracy": word_accuracy,
            "mastery": progress_row.mastery,
        })
    weak_word_list = sorted(
        weak_word_candidates,
        key=lambda item: (item["accuracy"], item["mastery"], -item["wrong"], -item["seen"]),
    )[:6]

    practiced_types = [item for item in type_breakdown if item["answered"] > 0]
    practiced_levels = [item for item in level_breakdown if item["answered"] > 0]
    weakest_type = min(practiced_types, key=lambda item: (item["accuracy"], -item["answered"])) if practiced_types else None
    weakest_level = min(practiced_levels, key=lambda item: (item["accuracy"], -item["answered"])) if practiced_levels else None

    if weak or due_count or (confidence_avg and confidence_avg < 2.5):
        recommended_strategy = "repair"
    elif event_rows and accuracy >= 70 and len(practiced_types) >= 2:
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
        event_count=len(event_rows),
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
