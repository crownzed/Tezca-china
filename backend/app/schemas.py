from pydantic import BaseModel, Field

from .models import QuizType


class QuizStartRequest(BaseModel):
    user_id: str = "local-user"
    level: int = Field(ge=1, le=6)
    quiz_type: QuizType
    limit: int = Field(default=10, ge=1, le=50)


class QuestionWordOut(BaseModel):
    """Metadata trực quan của từ mục tiêu, kèm theo mỗi câu hỏi.

    Cho phép card câu hỏi render hook trực quan (tô màu thanh điệu,
    gợi ý bộ thủ, cặp dễ nhầm) trong khoảnh khắc REVEAL→ENCODE
    sau khi trả lời, thay vì chỉ hiện nghĩa trơn.
    """

    word_id: int | None = None
    hanzi: str = ""
    pinyin: str = ""
    meaning_vi: str = ""
    tone_pattern: str = ""
    character_family: str = ""
    component_hint: str = ""
    confusable_words: list[str] = Field(default_factory=list)
    collocations: list[str] = Field(default_factory=list)
    topic: str = "core"

    @classmethod
    def from_word(cls, word) -> "QuestionWordOut | None":
        if word is None:
            return None
        return cls(
            word_id=word.id,
            hanzi=word.hanzi,
            pinyin=word.pinyin or "",
            meaning_vi=word.meaning_vi or word.meaning_en or "",
            tone_pattern=word.tone_pattern or "",
            character_family=word.character_family or "",
            component_hint=word.component_hint or "",
            confusable_words=list(word.confusable_words_json or []),
            collocations=list(word.collocations_json or []),
            topic=word.topic or "core",
        )

class QuestionOut(BaseModel):
    id: int
    level: int
    quiz_type: QuizType
    prompt: str
    options: list[str]
    correct_index: int = 0
    audio_text: str = ""
    explanation: str = ""
    metadata_json: dict = Field(default_factory=dict)
    word: QuestionWordOut | None = None


class QuizOut(BaseModel):
    questions: list[QuestionOut]


class AnswerIn(BaseModel):
    question_id: int
    selected_index: int
    confidence: int | None = Field(default=None, ge=1, le=4)
    latency_ms: int | None = Field(default=None, ge=0)
    error_tag: str | None = None


class QuizSubmitRequest(BaseModel):
    user_id: str = "local-user"
    level: int = Field(ge=1, le=6)
    quiz_type: QuizType
    session_id: int | None = None
    record_events: bool = True
    answers: list[AnswerIn]


class AnswerResult(BaseModel):
    question_id: int
    correct: bool
    correct_index: int
    explanation: str = ""


class QuizSubmitResponse(BaseModel):
    score: int
    total: int
    results: list[AnswerResult]


class StatsOut(BaseModel):
    attempts: int
    answered: int
    accuracy: int
    mastery_label: str
    weak_words: int

class AnalyticsTypeItem(BaseModel):
    quiz_type: QuizType
    label: str
    attempts: int
    answered: int
    correct: int
    accuracy: int

class AnalyticsLevelItem(BaseModel):
    level: int
    attempts: int
    answered: int
    correct: int
    accuracy: int

class AnalyticsTrendPoint(BaseModel):
    label: str
    level: int
    quiz_type: QuizType
    score: int
    total: int
    accuracy: int

class AnalyticsWeakWord(BaseModel):
    level: int
    hanzi: str
    pinyin: str = ""
    meaning_vi: str = ""
    seen: int
    wrong: int
    accuracy: int
    mastery: int

class AnalyticsRecommendation(BaseModel):
    level: int
    quiz_type: QuizType
    title: str
    reason: str
    target_accuracy: int
    focus_words: list[str] = []
    recommended_strategy: str = "targeted"

class AnalyticsOut(BaseModel):
    attempts: int
    answered: int
    accuracy: int
    mastery_label: str
    weak_words: int
    memory_stability: int = 0
    listening_readiness: int = 0
    context_transfer: int = 0
    production_readiness: int = 0
    event_count: int = 0
    due_count: int = 0
    confidence_avg: float = 0
    latency_avg_ms: int = 0
    type_breakdown: list[AnalyticsTypeItem]
    level_breakdown: list[AnalyticsLevelItem]
    recent_trend: list[AnalyticsTrendPoint]
    weak_word_list: list[AnalyticsWeakWord]
    recommendation: AnalyticsRecommendation


class RetrievalRung(BaseModel):
    level: int
    label: str
    mode: str
    skill: str
    is_production: bool = False


class AcquisitionStateOut(BaseModel):
    stage: str = "UNKNOWN"
    label: str = ""
    index: int = 0
    progress_to_next: int = 0
    is_productive: bool = False

class TodayFocusWord(BaseModel):
    word_id: int | None = None
    level: int
    hanzi: str
    pinyin: str = ""
    meaning_vi: str = ""
    accuracy: int = 0
    priority: float = 0.0
    retrieval: RetrievalRung | None = None
    acquisition: AcquisitionStateOut | None = None
    next_review_at: str | None = None
    tone_pattern: str = ""
    character_family: str = ""
    component_hint: str = ""
    collocations: list[str] = Field(default_factory=list)
    confusable_words: list[str] = Field(default_factory=list)
    topic: str = "core"
    frequency_band: str = "core_hsk"


class TodayMission(BaseModel):
    key: str
    label: str
    value: str
    detail: str
    tone: str

class TodayBehaviorMetrics(BaseModel):
    ewma_accuracy: int = 0
    ewma_confidence: float = 0
    ewma_latency_ms: int = 0
    completion_rate: int = 0
    wrong_streak: int = 0


class RepairFocusWord(BaseModel):
    word_id: int | None = None
    hanzi: str
    pinyin: str = ""
    meaning_vi: str = ""
    level: int = 1


class RepairDistributionItem(BaseModel):
    error_tag: str
    count: int
    label: str


class RepairConfusionItem(BaseModel):
    pair: str
    count: int


class RepairPlan(BaseModel):
    error_tag: str
    label: str
    method: str
    quiz_type: QuizType
    tone: str = "cinnabar"
    error_count: int = 0
    focus_words: list[RepairFocusWord] = Field(default_factory=list)
    distribution: list[RepairDistributionItem] = Field(default_factory=list)
    confusion_matrix: list[RepairConfusionItem] = Field(default_factory=list)


class TodaySessionOut(BaseModel):
    session_type: str
    behavior_state: str
    behavior_label: str = "Duy trì"
    behavior_reason: str = ""
    nudge: str = ""
    force_micro: bool = False
    block_new_words: bool = False
    reduce_difficulty: bool = False
    allow_stretch: bool = False
    behavior_metrics: TodayBehaviorMetrics = Field(default_factory=TodayBehaviorMetrics)
    estimated_minutes: int
    level: int
    quiz_type: QuizType
    limit: int
    due_count: int
    weak_count: int
    new_count: int
    target_skills: list[str]
    focus_words: list[TodayFocusWord]
    missions: list[TodayMission]
    repair_plan: RepairPlan | None = None
    reason: str

class SessionStartRequest(BaseModel):
    user_id: str = "local-user"
    session_type: str = "standard"
    behavior_state: str = "maintenance"
    estimated_minutes: int = Field(default=20, ge=1, le=180)
    target_words_json: list[dict] = Field(default_factory=list)
    target_skills_json: list[str] = Field(default_factory=list)
    reason: str = ""

class SessionStartOut(BaseModel):
    id: int
    user_id: str
    session_type: str
    behavior_state: str
    estimated_minutes: int
    reason: str = ""

class SessionEventRequest(BaseModel):
    user_id: str = "local-user"
    session_id: int | None = None
    question_id: int
    selected_index: int
    confidence: int | None = Field(default=None, ge=1, le=4)
    latency_ms: int | None = Field(default=None, ge=0)
    error_tag: str | None = None
    item_type: str = "quiz"

class SessionEventOut(BaseModel):
    event_id: int | None = None
    question_id: int
    correct: bool
    correct_index: int
    explanation: str = ""
    error_tag: str = ""
    next_review_at: str | None = None

class SessionCompleteRequest(BaseModel):
    user_id: str = "local-user"
    session_id: int
    summary: dict = Field(default_factory=dict)

class SessionCompleteOut(BaseModel):
    id: int
    completed_at: str

class TypingDetailIn(BaseModel):
    """Tín hiệu gõ thực tế thu ở client (SPEC v2 mục 3.1, 3.3).

    Dùng để đo lỗi gõ pinyin/hanzi hay gặp — một trong các tín hiệu usage.
    Tất cả optional + bounded để client gửi bao nhiêu tùy khả năng.
    """

    keystrokes: int = Field(default=0, ge=0)
    backspaces: int = Field(default=0, ge=0)
    corrections: int = Field(default=0, ge=0)  # số lần sửa (xóa rồi gõ lại)
    duration_ms: int = Field(default=0, ge=0)
    pinyin_typos: int = Field(default=0, ge=0)  # gõ sai pinyin (so target)
    wrong_char: int = Field(default=0, ge=0)    # chọn/gõ sai chữ Hán

class SessionOutputRequest(BaseModel):
    user_id: str = "local-user"
    session_id: int | None = None
    word_id: int | None = None
    target_word: str
    prompt: str = ""
    response_text: str = Field(min_length=1)
    typing_detail: TypingDetailIn | None = None

class SessionOutputOut(BaseModel):
    event_id: int | None = None
    correct: bool
    score: int
    target_word: str
    used_target: bool
    production_score: int
    feedback: str
    next_practice_at: str | None = None


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    email: str = Field(min_length=5, max_length=128)
    password: str = Field(min_length=6, max_length=128)
    display_name: str | None = Field(default=None, max_length=64)


class LoginRequest(BaseModel):
    login: str = Field(min_length=3, max_length=128)
    password: str = Field(min_length=6, max_length=128)


class UserOut(BaseModel):
    id: str
    username: str
    email: str
    display_name: str
    leaderboard_opt_in: bool
    created_at: str


class AuthResponse(BaseModel):
    token: str
    user: UserOut


class UpdateProfileRequest(BaseModel):
    display_name: str | None = Field(default=None, max_length=64)
    leaderboard_opt_in: bool | None = None


class LeaderboardEntryOut(BaseModel):
    rank: int | None = None
    user_id: str
    display_name: str
    points: int
    quiz_count: int = 0
    session_count: int = 0
    mastery_count: int = 0


class LeaderboardOut(BaseModel):
    period: str
    entries: list[LeaderboardEntryOut]
    me: LeaderboardEntryOut | None = None


class TitleOut(BaseModel):
    id: str
    label: str
    description: str
    earned: bool


class ProfileStatsOut(BaseModel):
    study_days: int
    current_streak: int
    longest_streak: int
    studied_today: bool = False
    quiz_count: int = 0
    session_count: int = 0
    mastery_count: int = 0
    points: int = 0
    accuracy: int = 0
    earned_titles: int = 0
    titles: list[TitleOut]


class ProfileOut(BaseModel):
    user: UserOut
    stats: ProfileStatsOut

class CustomVocabGenerateRequest(BaseModel):
    words: list[str] = Field(min_length=1, max_length=20)

class CustomVocabGenerateResponse(BaseModel):
    session_id: int
    message: str
    questions: list[QuestionOut] = []

