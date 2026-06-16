from datetime import datetime
from random import shuffle

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import LearningEvent, Question, QuizAttempt, QuizType, UserProgress
from ..schemas import AnswerResult, QuizSubmitRequest, QuizSubmitResponse
from .event_service import LearningEventService
from .item_difficulty import difficulty_fit, is_low_quality
from .question_generator import QuestionGeneratorService, RICH_PARAGRAPH_MARKERS
from .srs_service import SRSService


class QuizService:
    def __init__(self, db: Session):
        self.db = db
        self.generator = QuestionGeneratorService(db)

    def get_quiz(self, user_id: str, level: int, quiz_type: QuizType, limit: int) -> list[Question]:
        bank_size = max(limit * 8, 80)
        self.generator.ensure_questions(level, quiz_type, bank_size)
        candidates = self.db.scalars(
            select(Question)
            .where(Question.level == level, Question.quiz_type == quiz_type)
            .order_by(Question.created_at.desc())
            .limit(bank_size * 3)
        ).all()
        if quiz_type == QuizType.listening:
            candidates = [q for q in candidates if q.prompt.startswith("Nghe câu")]
        if quiz_type == QuizType.dialogue:
            candidates = [q for q in candidates if q.prompt.startswith("Nghe đoạn hội thoại")]
            self._refresh_dialogue_options(candidates)
        if quiz_type == QuizType.translation:
            paragraph_candidates = [q for q in candidates if q.prompt.startswith("Dịch đoạn nói") and any(marker in q.prompt for marker in RICH_PARAGRAPH_MARKERS)]
            candidates = paragraph_candidates
        if quiz_type == QuizType.cloze:
            rich_candidates = [q for q in candidates if len(q.prompt) >= 90]
            candidates = rich_candidates
        if not candidates:
            return []

        last_question_ids = self._recent_question_ids(user_id, level, quiz_type, attempt_count=1)
        recent_question_ids = self._recent_question_ids(user_id, level, quiz_type, attempt_count=3)
        progress_by_word = self._progress_by_word(user_id)
        difficulty_stats = self._difficulty_stats([q.id for q in candidates])

        fresh = self._rank_questions(
            candidates, progress_by_word, last_question_ids, recent_question_ids, difficulty_stats
        )
        selected = fresh[:limit]
        if len(selected) >= limit:
            return selected

        selected_ids = {q.id for q in selected}
        fallback = [q for q in candidates if q.id not in selected_ids]
        shuffle(fallback)
        return [*selected, *fallback[: limit - len(selected)]]

    def _refresh_dialogue_options(self, questions: list[Question]) -> None:
        changed = False
        for question in questions:
            if not question.word or not any(len(option) > 55 for option in question.options or []):
                continue
            options, correct_index, option_word_ids = self.generator._options_with_words(question.word, QuizType.dialogue)
            if len(options) < 4:
                continue
            question.options = options
            question.correct_index = correct_index
            question.explanation = self.generator._explanation_for(question.word, QuizType.dialogue)
            question.audio_text = self.generator._audio_for(question.word, QuizType.dialogue)
            meta = dict(question.metadata_json or {})
            meta["option_word_ids"] = option_word_ids
            question.metadata_json = meta
            changed = True
        if changed:
            self.db.commit()

    def submit(self, payload: QuizSubmitRequest) -> QuizSubmitResponse:
        question_ids = [answer.question_id for answer in payload.answers]
        questions = self.db.scalars(select(Question).where(Question.id.in_(question_ids))).all()
        by_id = {q.id: q for q in questions}

        score = 0
        results: list[AnswerResult] = []
        stored_answers = []
        srs = SRSService(self.db)
        events = LearningEventService(self.db)
        for answer in payload.answers:
            question = by_id.get(answer.question_id)
            if not question:
                continue
            correct = answer.selected_index == question.correct_index
            score += 1 if correct else 0
            if payload.record_events:
                srs.update_from_answer(payload.user_id, question, correct, answer.confidence, answer.latency_ms)
                events.record_quiz_answer(
                    payload.user_id,
                    question,
                    correct,
                    answer.confidence,
                    answer.latency_ms,
                    answer.error_tag,
                    session_id=payload.session_id,
                    selected_index=answer.selected_index,
                )
            result = AnswerResult(
                question_id=question.id,
                correct=correct,
                correct_index=question.correct_index,
                explanation=question.explanation,
            )
            results.append(result)
            stored_answers.append({
                "question_id": question.id,
                "selected_index": answer.selected_index,
                "correct": correct,
                "confidence": answer.confidence,
                "latency_ms": answer.latency_ms,
                "error_tag": answer.error_tag,
            })

        attempt = QuizAttempt(
            user_id=payload.user_id,
            level=payload.level,
            quiz_type=payload.quiz_type,
            score=score,
            total=len(results),
            answers=stored_answers,
        )
        self.db.add(attempt)
        self.db.commit()
        return QuizSubmitResponse(score=score, total=len(results), results=results)

    def _recent_question_ids(self, user_id: str, level: int, quiz_type: QuizType, attempt_count: int) -> set[int]:
        attempts = self.db.scalars(
            select(QuizAttempt)
            .where(QuizAttempt.user_id == user_id, QuizAttempt.level == level, QuizAttempt.quiz_type == quiz_type)
            .order_by(QuizAttempt.created_at.desc())
            .limit(attempt_count)
        ).all()
        ids: set[int] = set()
        for attempt in attempts:
            for answer in attempt.answers or []:
                question_id = answer.get("question_id")
                if question_id is not None:
                    ids.add(int(question_id))
        return ids

    def _progress_by_word(self, user_id: str) -> dict[int, UserProgress]:
        rows = self.db.scalars(select(UserProgress).where(UserProgress.user_id == user_id)).all()
        return {row.word_id: row for row in rows}

    def _difficulty_stats(self, question_ids: list[int]) -> dict[int, tuple[int, int]]:
        """Gom (số đúng, tổng lượt) toàn hệ cho mỗi câu từ ``LearningEvent``.

        Đây là dữ liệu thô cho ``item_difficulty`` (độ khó thực nghiệm). Tính
        trên TOÀN BỘ người dùng (không lọc theo user) vì độ khó của câu là
        thuộc tính của câu, không phải của người học.
        """
        if not question_ids:
            return {}
        rows = self.db.execute(
            select(
                LearningEvent.question_id,
                func.count(LearningEvent.id),
                func.sum(LearningEvent.correct),
            )
            .where(LearningEvent.question_id.in_(question_ids))
            .group_by(LearningEvent.question_id)
        ).all()
        stats: dict[int, tuple[int, int]] = {}
        for question_id, total, correct in rows:
            if question_id is None:
                continue
            stats[int(question_id)] = (int(correct or 0), int(total or 0))
        return stats

    def _rank_questions(
        self,
        questions: list[Question],
        progress_by_word: dict[int, UserProgress],
        last_question_ids: set[int],
        recent_question_ids: set[int],
        difficulty_stats: dict[int, tuple[int, int]] | None = None,
    ) -> list[Question]:
        difficulty_stats = difficulty_stats or {}
        shuffled = list(questions)
        shuffle(shuffled)

        def priority(question: Question) -> tuple[int, int, int, float, int]:
            if question.id in last_question_ids:
                recent_penalty = 5
            elif question.id in recent_question_ids:
                recent_penalty = 3
            else:
                recent_penalty = 0

            progress = progress_by_word.get(question.word_id or -1)
            if not progress:
                knowledge_rank = 0
            elif progress.next_review_at is None or progress.next_review_at <= datetime.utcnow():
                knowledge_rank = 0
            elif progress.wrong > 0 and progress.correct / max(1, progress.seen) < 0.75:
                knowledge_rank = 1
            elif progress.mastery >= 70 or (progress.correct > 0 and progress.wrong == 0):
                knowledge_rank = 4
            else:
                knowledge_rank = 2

            # Độ khó thực nghiệm: câu kém chất lượng bị đẩy xuống cuối; còn lại
            # ưu tiên câu có độ khó "vừa đủ" (difficulty_fit cao). Đặt SAU các
            # tín hiệu cũ (recent/knowledge) để không phá hành vi sẵn có khi
            # chưa có dữ liệu lượt làm.
            correct, total = difficulty_stats.get(question.id, (0, 0))
            low_quality_rank = 1 if is_low_quality(correct, total) else 0
            fit_penalty = -difficulty_fit(correct, total)

            return (
                recent_penalty,
                low_quality_rank,
                knowledge_rank,
                fit_penalty,
                progress.seen if progress else 0,
            )

        return sorted(shuffled, key=priority)

    def _update_progress(self, user_id: str, question: Question, correct: bool) -> None:
        if not question.word_id:
            return
        progress = self.db.scalar(
            select(UserProgress).where(UserProgress.user_id == user_id, UserProgress.word_id == question.word_id)
        )
        if not progress:
            progress = UserProgress(user_id=user_id, word_id=question.word_id, seen=0, correct=0, wrong=0, mastery=0)
            self.db.add(progress)
        progress.seen += 1
        progress.correct += 1 if correct else 0
        progress.wrong += 0 if correct else 1
        progress.mastery = max(0, min(100, progress.mastery + (12 if correct else -18)))
        progress.last_seen_at = datetime.utcnow()
