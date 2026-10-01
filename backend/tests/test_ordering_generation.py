"""Ordering generation regressions: mocked providers and sessions, no network or DB."""
from copy import deepcopy
import json
from pathlib import Path
from unittest.mock import Mock, patch

import pytest
from sqlalchemy.orm import Session

from app.models import Example, QuizType, Word
from app.services import llm_generator_service as llm
from app.services.ordering_contract import grade_ordering, normalize_ordering
from app.services.question_generator import QuestionGeneratorService

FIXTURES = json.loads((Path(__file__).resolve().parents[2] / "tests/fixtures/ordering-v1.json").read_text(encoding="utf-8"))


@pytest.fixture(autouse=True)
def no_provider(monkeypatch):
    blocked = Mock(side_effect=AssertionError("Provider calls are forbidden in generation tests"))
    monkeypatch.setattr(llm, "_call_api", blocked)
    monkeypatch.setattr(llm, "_call_provider", blocked)
    yield
    blocked.assert_not_called()


def generator_for(hanzi, sentences):
    db = Mock(spec=Session)
    db.scalar.return_value = None
    generator = QuestionGeneratorService(db)
    word = Word(id=1, hanzi=hanzi, pinyin="test", meaning_vi="nghĩa thử", hsk_level=1)
    generator._example_cache[word.id] = [
        Example(word_id=word.id, sentence_cn=sentence, sentence_vi=f"Câu ví dụ {index}.")
        for index, sentence in enumerate(sentences)
    ]
    return generator, word


def fresh_proposal(tokens=None):
    return {
        "quiz_type": "drag_drop",
        "target_hanzi": "学习",
        "explanation": "Trạng ngữ thời gian đứng trước động từ.",
        "metadata": {
            "correct_order": ["我", "今天", "学习中文。"] if tokens is None else tokens,
            "sentence_vi": "Hôm nay tôi học tiếng Trung.",
            "notes": {"tags": ["time-before-verb"]},
        },
    }


def explicit_row(metadata):
    return {
        "quiz_type": "drag_drop", "target_hanzi": "我",
        "prompt": "Sắp xếp các từ thành câu đúng.",
        "options": ["__drag_1__", "__drag_2__", "__drag_3__", "__drag_4__"],
        "correct_index": 0, "explanation": "Đặt chủ ngữ trước vị ngữ.",
        "metadata": deepcopy(metadata),
    }


def vocab_row():
    return {
        "quiz_type": "vocab", "target_hanzi": "学习",
        "prompt": "Chọn nghĩa đúng của: 学习",
        "options": ["A. học tập", "B. chạy bộ", "C. ngủ", "D. ăn uống"],
        "correct_index": 0, "explanation": "学习 có nghĩa là học tập.",
        "metadata": {"notes": ["keep"]},
    }


@pytest.mark.parametrize("bad_row", [None, 7, "invalid", [], True])
def test_bundle_keeps_valid_rows_around_a_malformed_row(monkeypatch, bad_row):
    response = {"questions": [fresh_proposal(), bad_row, vocab_row()]}
    before = deepcopy(response)
    api = Mock(return_value=response)
    monkeypatch.setattr(llm, "_call_api", api)

    result = llm.generate_quiz_bundle_for_hsk(1, {"drag_drop": 2, "vocab": 1}, [])

    assert [row["quiz_type"] for row in result["questions"]] == ["drag_drop", "vocab"]
    assert result["_quality"] == {
        "accepted": 2, "rejected": 1, "missing": {"drag_drop": 1},
        "reasons": ["question must be an object"],
    }
    for row in result["questions"]:
        assert llm._validate_api_quiz_question(row, row["quiz_type"]) == (True, "ok")
    assert response == before
    api.assert_called_once()
    assert api.call_args.kwargs == {"content_task": True}


def test_bundle_with_no_valid_rows_reports_no_progress(monkeypatch):
    api = Mock(return_value={"questions": [None, [], "invalid", 7, True]})
    monkeypatch.setattr(llm, "_call_api", api)
    with pytest.raises(RuntimeError, match="question must be an object"):
        llm.generate_quiz_bundle_for_hsk(1, {"drag_drop": 1}, [])
    api.assert_called_once()


@pytest.mark.parametrize("hanzi,sentence,segments", [
    ("我", "我是学生。", ["我", "是学生。"]),
    ("学生", "我是学生。", ["我是", "学生。"]),
    ("喜欢", "我喜欢苹果，你喜欢香蕉。", ["我", "喜欢", "苹果，", "你", "喜欢", "香蕉。"]),
    ("我", " “我喜欢学习。” ", [" “我", "喜欢学习。” "]),
    ("学习", "我每天学习中文，晚上也学习。", ["我每天", "学习", "中文，", "晚上也", "学习。"]),
])
def test_template_attaches_punctuation_and_preserves_sentence(hanzi, sentence, segments):
    generator, word = generator_for(hanzi, [sentence])
    example = generator._example_cache[word.id][0]
    before = (word.hanzi, example.sentence_cn, example.sentence_vi)

    for seed in range(20):
        row = generator._drag_drop_for_word(word, seed)
        assert row is not None
        ordering = normalize_ordering(row)
        assert row["ordering_version"] == "ordering-v1"
        assert row["segments"] == segments
        assert row["correct_order"] == list(range(len(segments)))
        assert all(any(char.isalnum() for char in token) for token in segments)
        assert "".join(ordering.segments[i] for i in ordering.correct_order) == sentence
        assert "".join(ordering.segments[i] for i in ordering.scrambled_indices) != sentence
        assert row["scrambled"] == " · ".join(ordering.segments[i] for i in ordering.scrambled_indices)
        assert row["sentence_vi"] == example.sentence_vi
        assert row == generator._drag_drop_for_word(word, seed)

    assert (word.hanzi, example.sentence_cn, example.sentence_vi) == before
    generator.db.assert_not_called()
    assert generator.db.mock_calls == []


def test_template_repeated_target_keeps_distinct_identities():
    generator, word = generator_for("喜欢", ["我喜欢苹果，你喜欢香蕉。"])
    row = generator._drag_drop_for_word(word, 47)
    selected = list(row["correct_order"])
    assert row["segments"][1] == row["segments"][4] == "喜欢"
    selected[1], selected[4] = selected[4], selected[1]
    assert "".join(row["segments"][i] for i in selected) == row["sentence_cn"]
    assert grade_ordering(row, row["correct_order"]) is True
    assert grade_ordering(row, selected) is False


@pytest.mark.parametrize("hanzi,sentences", [
    ("我", []), ("我", [""]), ("我", [None]), ("我", ["你是学生。"]),
    ("", ["我是学生。"]), ("我", ["我"]), ("我", ["我。"]),
    ("想", ["想想"]), ("。", ["。。。"]),
])
def test_template_rejects_impossible_or_missing_input(hanzi, sentences):
    generator, word = generator_for(hanzi, sentences)
    assert generator._drag_drop_for_word(word, 47) is None
    assert generator.db.mock_calls == []


@pytest.mark.parametrize("seed", [None, 47])
def test_question_creation_reuses_one_drag_generation(seed):
    generator, word = generator_for("喜欢", ["我喜欢苹果，你喜欢香蕉。", "她喜欢喝茶。"])
    with (patch.object(generator, "_drag_drop_for_word", wraps=generator._drag_drop_for_word) as generate,
          patch.object(generator, "_word_pool", side_effect=AssertionError("Drag needs no distractor pool")),
          patch.object(generator, "_extra_metadata", side_effect=AssertionError("Must reuse generated metadata")),
          patch.object(generator, "_audio_for", side_effect=AssertionError("Must reuse generated audio"))):
        question = generator._get_or_create_question(word, 1, QuizType.drag_drop, seed)
        generate.assert_called_once_with(word, seed)

    assert question is not None
    ordering = normalize_ordering(question.metadata_json)
    sentence = "".join(ordering.segments[i] for i in ordering.correct_order)
    assert question.prompt == "Sắp xếp từ thành câu đúng: " + " · ".join(
        ordering.segments[i] for i in ordering.scrambled_indices
    )
    assert question.audio_text == question.options[question.correct_index] == sentence
    assert question.explanation.startswith(f"Câu đúng: {sentence}")
    assert question.metadata_json["question_subtype"] == "drag_drop"
    assert question.metadata_json["option_word_ids"] == [word.id, None, None, None]
    generator.db.add.assert_called_once_with(question)
    generator.db.flush.assert_called_once_with()
    generator.db.commit.assert_not_called()


@pytest.mark.parametrize("tokens", [
    ["我", "今天", "学习中文。"],
    ["想", "想", "办法。"],
    [" “我", "今天", "学习中文。” "],
])
def test_fresh_llm_proposal_becomes_canonical_without_mutating_input(tokens):
    item = fresh_proposal(tokens)
    before = deepcopy(item)
    row = llm._normalize_api_quiz_question(item, "drag_drop")
    ordering = normalize_ordering(row["metadata"])

    assert row["metadata"]["ordering_version"] == "ordering-v1"
    assert row["metadata"]["segments"] == tokens
    assert row["metadata"]["correct_order"] == list(range(len(tokens)))
    assert row["metadata"]["sentence_vi"] == item["metadata"]["sentence_vi"]
    assert row["prompt"] == "Sắp xếp từ thành câu đúng: " + " · ".join(
        ordering.segments[i] for i in ordering.scrambled_indices
    )
    assert len(row["options"]) == len(set(row["options"])) == 4
    assert row["correct_index"] == 0
    assert llm._validate_api_quiz_question(row, "drag_drop") == (True, "ok")
    assert llm._normalize_api_quiz_question(item, "drag_drop") == row
    assert llm._normalize_api_quiz_question(row, "drag_drop") == row
    assert item == before
    row["metadata"]["segments"][0] = "changed"
    row["metadata"]["notes"]["tags"].append("changed")
    assert item == before


@pytest.mark.parametrize("tokens", [
    [], ["我"], ["想", "想"], ["哈", "哈哈"], ["我", "。"], ["我", " "],
    ["我", 1], ["我", True], ["我", None], ["我", {"token": "学习"}],
    [0, 1], "我今天学习中文。",
])
def test_invalid_fresh_proposals_are_not_coerced_or_repaired(tokens):
    item = fresh_proposal(tokens)
    before = deepcopy(item)
    row = llm._normalize_api_quiz_question(item, "drag_drop")
    assert row == item == before
    assert llm._validate_api_quiz_question(row, "drag_drop")[0] is False


@pytest.mark.parametrize("key,value", [
    ("ordering_version", "ordering-v1"), ("ordering_version", "unknown"),
    ("segments", []), ("scrambled_indices", []), ("accepted_orders", []),
    ("accepted_orders", [["我", "今天", "学习中文。"]]),
])
def test_any_explicit_structural_key_prevents_fresh_proposal_conversion(key, value):
    item = explicit_row(fresh_proposal()["metadata"])
    item["metadata"][key] = value
    before = deepcopy(item)
    row = llm._normalize_api_quiz_question(item, "drag_drop")
    assert row == item == before
    assert llm._validate_api_quiz_question(row, "drag_drop")[0] is False


@pytest.mark.parametrize("case", FIXTURES["cases"], ids=lambda case: case["name"])
def test_explicit_and_legacy_metadata_are_validated_without_rewriting(case):
    metadata = deepcopy(case.get("metadata", {**FIXTURES["base"], **case.get("patch", {})}))
    for key in case.get("omit", []):
        metadata.pop(key, None)
    item = explicit_row(metadata)
    before = deepcopy(item)
    row = llm._normalize_api_quiz_question(item, "drag_drop")
    assert row == item == before
    assert row is not item
    if isinstance(item["metadata"], dict):
        assert row["metadata"] is not item["metadata"]
    ok, reason = llm._validate_api_quiz_question(row, "drag_drop")
    if "error" in case:
        assert (ok, reason) == (False, f"drag_drop {case['error']}")
    else:
        assert (ok, reason) == (True, "ok")
        for answer in case.get("answers", []):
            if "correct" in answer:
                assert grade_ordering(row["metadata"], answer["selected"]) is answer["correct"]


@pytest.mark.parametrize("metadata", [None, [], "invalid", 1, True])
def test_non_object_metadata_is_rejected_without_throwing(metadata):
    item = explicit_row(metadata)
    row = llm._normalize_api_quiz_question(item, "drag_drop")
    assert row == item
    assert llm._validate_api_quiz_question(row, "drag_drop") == (False, "drag_drop ordering_metadata")


def test_ordinary_mcq_still_strips_labels_and_shuffles_without_mutation():
    item = vocab_row()
    before = deepcopy(item)
    row = llm._normalize_api_quiz_question(item, "vocab")
    assert sorted(row["options"]) == sorted(["học tập", "chạy bộ", "ngủ", "ăn uống"])
    assert row["options"][row["correct_index"]] == "học tập"
    assert llm._validate_api_quiz_question(row, "vocab") == (True, "ok")
    assert row == llm._normalize_api_quiz_question(item, "vocab")
    assert item == before
    row["metadata"]["notes"].append("changed")
    assert item == before
    positions = {
        llm._normalize_api_quiz_question({**before, "prompt": f"{before['prompt']} ({i})"}, "vocab")["correct_index"]
        for i in range(30)
    }
    assert len(positions) > 1


def test_passage_sentence_scramble_remains_a_reading_mcq(monkeypatch):
    item = {
        "quiz_type": "reading", "question_subtype": "sentence_scramble",
        "prompt": "Chọn câu có trật tự từ đúng: 我 / 今天 / 学习中文。",
        "options": ["我今天学习中文。", "中文今天学习我。", "学习中文我今天。", "我学习今天中文。"],
        "correct_index": 0, "explanation": "Trạng ngữ thời gian đứng trước động từ.",
    }
    api = Mock(return_value={"questions": [deepcopy(item)]})
    monkeypatch.setattr(llm, "_call_api", api)
    result = llm.generate_questions_for_passage("我今天学习中文。", 1, 1, ["sentence_scramble"])
    assert result["questions"] == [item]
    assert result["_quality"] == {"accepted": 1, "rejected": 0}
    assert llm._validate_passage_question({**item, "quiz_type": "drag_drop"})[0] is False
    api.assert_called_once()
    assert 'question_subtype="sentence_scramble" -> quiz_type="reading"' in api.call_args.args[0]
    assert "metadata" not in result["questions"][0]
