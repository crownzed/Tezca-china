"""Ordering integration: isolated in-memory SQLite, no app startup or providers."""
from copy import deepcopy
import json
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError
import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.models import LearningEvent, Question, QuizAttempt, QuizType, UserProgress, Word
from app.routers import quiz as routes
from app.schemas import AnswerIn, QuizSubmitRequest, SessionEventRequest
from app.services import quiz_service, session_service
from app.services.ordering_contract import OrderingError

FIXTURES = json.loads((Path(__file__).resolve().parents[2] / "tests/fixtures/ordering-v1.json").read_text(encoding="utf-8"))
BASE = FIXTURES["base"]


def metadata_for(case):
    meta = deepcopy(case.get("metadata", {**BASE, **case.get("patch", {})}))
    for key in case.get("omit", []):
        meta.pop(key, None)
    return meta


@pytest.fixture
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as session:
        session.add(Word(id=1, hanzi="我", hsk_level=1, meaning_vi="tôi"))
        session.add_all([
            Question(id=i, word_id=1, level=1, quiz_type=QuizType.drag_drop,
                     prompt=f"Sắp xếp {i}", options=["—"] * 4, correct_index=0,
                     explanation="Giải thích", audio_text="我是学生。", metadata_json=deepcopy(BASE))
            for i in (1, 2)
        ])
        session.add(UserProgress(user_id="learner", word_id=1, seen=3, correct=2, wrong=1, mastery=10))
        session.commit()
        yield session
    engine.dispose()


def submit(db, answers, record_events=True):
    return quiz_service.QuizService(db).submit(QuizSubmitRequest(
        user_id="learner", level=1, quiz_type="drag_drop", record_events=record_events,
        answers=[AnswerIn(**answer) for answer in answers],
    ))


def record(db, answer):
    return session_service.SessionService(db).record_event(user_id="learner", **answer)


VALID_ANSWERS = [
    (case, answer) for case in FIXTURES["cases"] if "error" not in case
    for answer in case.get("answers", []) if "correct" in answer
]


@pytest.mark.parametrize("method", ["submit", "event"])
@pytest.mark.parametrize("case,answer", VALID_ANSWERS, ids=[
    f"{case['name']}-{answer['correct']}" for case, answer in VALID_ANSWERS
])
def test_canonical_grading_and_persistence(db, method, case, answer):
    question = db.get(Question, 1)
    question.metadata_json = metadata_for(case)
    db.commit()
    before = deepcopy(question.metadata_json)
    # Deliberately contradict the real ordering: MCQ placeholders cannot forge a grade.
    selected = deepcopy(answer["selected"])
    payload = {"question_id": 1, "selected_index": 3 if answer["correct"] else 0,
               "selected_order": selected, "confidence": 2, "latency_ms": 500}
    if method == "submit":
        result = submit(db, [payload])
        assert result.score == int(answer["correct"]) and result.total == 1
        assert result.results[0].correct is answer["correct"]
        stored = db.scalar(select(QuizAttempt)).answers[0]
        assert stored["selected_order"] == selected
        assert stored["ordering_version"] == "ordering-v1"
        assert stored["correct"] is answer["correct"]
        selected.reverse()
        assert stored["selected_order"] == answer["selected"]
    else:
        result = record(db, payload)
        assert result["correct"] is answer["correct"]
        assert db.scalar(select(QuizAttempt)) is None
    progress = db.scalar(select(UserProgress))
    assert progress.seen == 4
    assert progress.correct == 2 + int(answer["correct"])
    assert progress.wrong == 1 + int(not answer["correct"])
    events = db.scalars(select(LearningEvent)).all()
    assert len(events) == 1 and events[0].correct == int(answer["correct"])
    assert question.metadata_json == before


BAD_CASES = [case for case in FIXTURES["cases"] if "error" in case]
BAD_SELECTIONS = [answer["selected"] for case in FIXTURES["cases"]
                  for answer in case.get("answers", []) if "error" in answer]


@pytest.mark.parametrize("method", ["submit", "event"])
@pytest.mark.parametrize("case", BAD_CASES, ids=lambda case: case["name"])
def test_invalid_metadata_never_mutates(db, method, case):
    question = db.get(Question, 2)
    question.metadata_json = metadata_for(case)
    db.commit()
    assert_rejected_without_mutation(db, method, question_id=2, error=case["error"])


@pytest.mark.parametrize("method", ["submit", "event"])
@pytest.mark.parametrize("selection", BAD_SELECTIONS)
def test_invalid_selection_never_mutates(db, method, selection):
    assert_rejected_without_mutation(db, method, selection=selection,
                                     error="ordering_selected_order")


@pytest.mark.parametrize("method", ["submit", "event"])
def test_missing_question_never_mutates(db, method):
    assert_rejected_without_mutation(db, method, question_id=999, error="question_not_found")


def assert_rejected_without_mutation(db, method, question_id=2, selection=(0, 1, 2), error="ordering_selected_order", record_events=True):
    word = db.get(Word, 1)
    progress = db.scalar(select(UserProgress))
    previous = {column.key: deepcopy(getattr(progress, column.key)) for column in UserProgress.__table__.columns}
    word.meaning_vi = "unrelated caller edit"
    pending = Word(hanzi="caller-pending", hsk_level=1)
    db.add(pending)
    selection = list(selection) if isinstance(selection, tuple) else selection
    bad = {"question_id": question_id, "selected_index": 0, "selected_order": selection}
    module = quiz_service if method == "submit" else session_service
    with (patch.object(module.SRSService, "update_from_answer") as srs,
          patch.object(module.LearningEventService, "record_quiz_answer") as events,
          patch.object(db, "add", wraps=db.add) as add,
          patch.object(db, "commit", wraps=db.commit) as commit,
          patch.object(db, "rollback", wraps=db.rollback) as rollback,
          patch.object(db, "flush", wraps=db.flush) as flush):
        expected = ValueError if error == "question_not_found" else OrderingError
        with pytest.raises(expected, match=f"^{error}$"):
            if method == "submit":
                # Bypass request type checks to also prove the service fails closed.
                answers = [AnswerIn(question_id=1, selected_index=0, selected_order=[0, 1, 2]),
                           AnswerIn.model_construct(**bad)]
                payload = QuizSubmitRequest.model_construct(user_id="learner", level=1,
                    quiz_type=QuizType.drag_drop, answers=answers, record_events=record_events, session_id=None)
                quiz_service.QuizService(db).submit(payload)
            else:
                record(db, bad)
        for spy in (srs, events, add, commit, rollback, flush):
            spy.assert_not_called()
    assert pending in db.new and word in db.dirty
    assert word.meaning_vi == "unrelated caller edit"
    assert {key: getattr(progress, key) for key in previous} == previous
    # A later caller commit must not leak a hidden earlier answer, nor lose caller work.
    db.commit()
    db.expire_all()
    assert db.scalar(select(QuizAttempt)) is None
    assert db.scalar(select(LearningEvent)) is None
    assert db.get(Word, 1).meaning_vi == "unrelated caller edit"
    assert db.scalar(select(Word).where(Word.hanzi == "caller-pending")) is not None
    assert {key: getattr(progress, key) for key in previous} == previous


@pytest.mark.parametrize("failure", ["selection", "metadata", "missing"])
def test_record_events_false_rejects_later_answer_without_mutation(db, failure):
    error = "ordering_selected_order"
    question_id = 2
    selection = None
    if failure == "metadata":
        db.get(Question, 2).metadata_json = {**BASE, "correct_order": [0, 0, 2]}
        db.commit()
        selection = [0, 1, 2]
        error = "ordering_correct_order"
    elif failure == "missing":
        question_id = 999
        error = "question_not_found"
    assert_rejected_without_mutation(db, "submit", question_id=question_id,
                                     selection=selection, error=error, record_events=False)


@pytest.mark.parametrize("selected,correct", [([0, 1, 2], True), ([2, 1, 0], False)])
def test_record_events_false_still_grades_and_stores(db, selected, correct):
    result = submit(db, [{"question_id": 1, "selected_index": 0, "selected_order": selected}], False)
    assert result.score == int(correct)
    assert db.scalar(select(LearningEvent)) is None
    assert db.scalar(select(UserProgress)).seen == 3
    stored = db.scalar(select(QuizAttempt)).answers[0]
    assert stored["selected_order"] == selected and stored["ordering_version"] == "ordering-v1"
    with pytest.raises(OrderingError):
        submit(db, [{"question_id": 1, "selected_index": 0}], False)
    assert len(db.scalars(select(QuizAttempt)).all()) == 1


@pytest.mark.parametrize("method", ["submit", "event"])
@pytest.mark.parametrize("selected,correct", [(0, True), (1, False)])
def test_mcq_keeps_selected_index_grading(db, method, selected, correct):
    question = db.get(Question, 1)
    question.quiz_type = QuizType.vocab
    question.metadata_json = {}
    db.commit()
    payload = {"question_id": 1, "selected_index": selected}
    if method == "submit":
        result = submit(db, [payload])
        assert result.results[0].correct is correct
        assert "ordering_version" not in db.scalar(select(QuizAttempt)).answers[0]
    else:
        assert record(db, payload)["correct"] is correct


@pytest.mark.parametrize("schema", [AnswerIn, SessionEventRequest])
@pytest.mark.parametrize("element", [True, False, 0.0, 0.5, "0", None])
def test_request_selected_order_does_not_coerce(schema, element):
    with pytest.raises(ValidationError):
        schema(question_id=1, selected_index=0, selected_order=[element, 1, 2])


@pytest.fixture
def client(db):
    app = FastAPI()
    app.include_router(routes.router)
    app.dependency_overrides[routes.get_db] = lambda: db
    app.dependency_overrides[routes.resolve_user_id] = lambda: "learner"
    with TestClient(app) as client:
        yield client


def post_answer(client, endpoint, answer):
    body = {"user_id": "forged-user", **answer}
    if endpoint == "/api/quiz/submit":
        body = {"user_id": "forged-user", "level": 1, "quiz_type": "drag_drop", "answers": [answer]}
    return client.post(endpoint, json=body)


@pytest.mark.parametrize("endpoint", ["/api/session/event", "/api/quiz/submit"])
def test_routes_forward_order_and_use_authenticated_identity(db, client, endpoint):
    response = post_answer(client, endpoint, {"question_id": 1, "selected_index": 3,
        "selected_order": [0, 1, 2], "ordering_version": "forged-version"})
    assert response.status_code == 200, response.text
    data = response.json()
    assert (data["results"][0]["correct"] if "results" in data else data["correct"]) is True
    assert db.scalar(select(LearningEvent)).user_id == "learner"
    if endpoint.endswith("submit"):
        attempt = db.scalar(select(QuizAttempt))
        assert attempt.user_id == "learner"
        assert attempt.answers[0]["ordering_version"] == "ordering-v1"


@pytest.mark.parametrize("endpoint", ["/api/session/event", "/api/quiz/submit"])
@pytest.mark.parametrize("answer,status,detail", [
    ({"question_id": 1, "selected_index": 0}, 422, "ordering_selected_order"),
    ({"question_id": 1, "selected_index": 0, "selected_order": [0, 0, 2]}, 422, "ordering_selected_order"),
    ({"question_id": 999, "selected_index": 0, "selected_order": [0, 1, 2]}, 404, "Question not found"),
    ({"question_id": 1, "selected_index": 0, "selected_order": [False, 1, 2]}, 422, None),
])
def test_route_errors_are_controlled_without_writes(db, client, endpoint, answer, status, detail):
    response = post_answer(client, endpoint, answer)
    assert response.status_code == status, response.text
    if detail:
        assert response.json()["detail"] == detail
    assert db.scalar(select(QuizAttempt)) is None
    assert db.scalar(select(LearningEvent)) is None
    assert db.scalar(select(UserProgress)).seen == 3


@pytest.mark.parametrize("endpoint", ["/api/session/event", "/api/quiz/submit"])
def test_routes_reject_malformed_metadata(db, client, endpoint):
    db.get(Question, 1).metadata_json = {**BASE, "correct_order": [0, 0, 2]}
    db.commit()
    response = post_answer(client, endpoint, {"question_id": 1, "selected_index": 0,
                                              "selected_order": [0, 1, 2]})
    assert response.status_code == 422, response.text
    assert response.json()["detail"] == "ordering_correct_order"
    assert db.scalar(select(QuizAttempt)) is None
    assert db.scalar(select(LearningEvent)) is None
    assert db.scalar(select(UserProgress)).seen == 3


@pytest.mark.parametrize("record_events", [True, False])
def test_route_later_invalid_answer_does_not_write(db, client, record_events):
    response = client.post("/api/quiz/submit", json={
        "level": 1, "quiz_type": "drag_drop", "record_events": record_events,
        "answers": [
            {"question_id": 1, "selected_index": 0, "selected_order": [0, 1, 2]},
            {"question_id": 2, "selected_index": 0, "selected_order": [0, 0, 2]},
        ],
    })
    assert response.status_code == 422, response.text
    assert response.json()["detail"] == "ordering_selected_order"
    db.commit()
    assert db.scalar(select(QuizAttempt)) is None
    assert db.scalar(select(LearningEvent)) is None
    assert db.scalar(select(UserProgress)).seen == 3


@pytest.mark.parametrize("endpoint,service,method", [
    ("/api/session/event", session_service.SessionService, "record_event"),
    ("/api/quiz/submit", quiz_service.QuizService, "submit"),
])
def test_unexpected_internal_errors_are_not_validation_responses(client, endpoint, service, method):
    with patch.object(service, method, side_effect=ValueError("internal-only")):
        with pytest.raises(ValueError, match="internal-only"):
            post_answer(client, endpoint, {"question_id": 1, "selected_index": 0, "selected_order": [0, 1, 2]})
