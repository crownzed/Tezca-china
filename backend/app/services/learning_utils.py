from ..models import QuizType


def skill_for_quiz_type(quiz_type: QuizType) -> str:
    if quiz_type in (QuizType.listening, QuizType.dialogue):
        return "listening"
    if quiz_type in (QuizType.reading, QuizType.translation, QuizType.cloze):
        return "context"
    return "recognition"


def prompt_modality_for_quiz_type(quiz_type: QuizType) -> str:
    if quiz_type in (QuizType.listening, QuizType.dialogue):
        return "audio"
    return "text"


def infer_error_tag(correct: bool, quiz_type: QuizType, provided: str | None = None) -> str:
    if correct:
        return provided or ""
    if provided:
        return provided
    if quiz_type in (QuizType.listening, QuizType.dialogue):
        return "sound_error"
    if quiz_type in (QuizType.reading, QuizType.translation, QuizType.cloze):
        return "context_error"
    return "meaning_error"
