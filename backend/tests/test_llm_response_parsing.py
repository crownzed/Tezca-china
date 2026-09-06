"""Unit tests for defensive JSON extraction at the LLM relay boundary."""

import json

import pytest

from app.services.llm_generator_service import (
    _clean_json_response,
    _strip_option_labels,
    _validate_api_quiz_question,
    _validate_question,
)


def test_clean_json_response_removes_json_fence():
    assert _clean_json_response('```json\n{"words": []}\n```') == '{"words": []}'


def test_clean_json_response_extracts_object_after_model_preamble():
    response = 'Đây là JSON bạn yêu cầu:\n{"summary": "ổn", "items": [1, 2]}\nCảm ơn!'
    assert _clean_json_response(response) == '{"summary": "ổn", "items": [1, 2]}'


def test_clean_json_response_ignores_non_json_brackets_in_the_preamble():
    response = 'Ghi chú [bản nháp]: {"summary": "ổn"}'
    assert _clean_json_response(response) == '{"summary": "ổn"}'


def test_clean_json_response_handles_braces_inside_a_json_string():
    response = '```\n{"prompt": "Dấu { } chỉ là ví dụ", "options": []}\n```'
    assert _clean_json_response(response) == '{"prompt": "Dấu { } chỉ là ví dụ", "options": []}'


def test_clean_json_response_leaves_invalid_content_for_the_caller_to_reject():
    assert _clean_json_response('Kết quả: {"missing": ') == 'Kết quả: {"missing":'


def test_clean_json_response_skips_a_valid_array_in_the_preamble():
    """Câu dẫn chứa mảng HỢP LỆ vẫn phải nhường cho object.

    Đây là ca nguy hiểm nhất: nếu trả về "[1, 2, 3]" thì ``json.loads`` trong
    ``_call_provider`` THÀNH CÔNG, nên nhánh retry ``except JSONDecodeError``
    không chạy, và caller huỷ cả bundle vì thiếu khoá 'words'.
    """
    response = 'Tôi đã tạo 3 câu hỏi [1, 2, 3] như sau:\n{"words": [{"hanzi": "学习"}]}'
    assert _clean_json_response(response) == '{"words": [{"hanzi": "学习"}]}'


def test_clean_json_response_returns_a_whole_array_when_there_is_no_object():
    """Không có object thì trả nguyên mảng, không phải phần tử đầu của nó."""
    assert _clean_json_response('[{"a": 1}, {"b": 2}]') == '[{"a": 1}, {"b": 2}]'


def test_clean_json_response_does_not_dig_into_a_truncated_object():
    """Response bị cắt vì ``finish_reason=length`` PHẢI để json.loads ném lỗi.

    Nếu quét vào trong khối chưa đóng thì tìm thấy phần tử đầu của mảng — một
    object hoàn chỉnh — và ``json.loads`` thành công, nên nhánh retry
    ``except JSONDecodeError`` trong ``_call_provider`` không chạy: mất cả 3 lượt
    retry và nguyên nhân thật (bị cắt) bị che sau "missing 'words' key".
    """
    truncated = '{"words": [{"hanzi": "苹果", "pinyin": "píng guǒ"}, {"hanzi": "面'
    result = _clean_json_response(truncated)
    with pytest.raises(json.JSONDecodeError):
        json.loads(result)


def test_clean_json_response_does_not_dig_into_a_truncated_object_after_preamble():
    """Cùng ca trên nhưng có câu dẫn phía trước — không được nhặt mảnh con."""
    truncated = 'Đây là kết quả:\n{"words": [{"hanzi": "苹果"}, {"hanzi": "面'
    with pytest.raises(json.JSONDecodeError):
        json.loads(_clean_json_response(truncated))


def test_clean_json_response_still_finds_object_when_string_holds_stray_braces():
    """Ngoặc trong chuỗi tiếng Trung không được tính vào độ sâu."""
    response = '{"prompt": "他说「你好」{不是}吗", "words": [1]}'
    assert _clean_json_response(response) == response


def test_clean_json_response_respects_escaped_quotes():
    r"""``\"`` không kết thúc chuỗi, nên ngoặc sau nó vẫn nằm trong chuỗi."""
    response = '{"prompt": "say \\"hi\\" now", "words": [1]}'
    assert _clean_json_response(response) == response


def test_strip_option_labels_keeps_stripped_form_when_content_repeats():
    """Nhãn khác nhau nhưng nội dung y hệt: phải trả bản ĐÃ bỏ nhãn.

    Trả bản gốc thì check trùng ở validator so hai chuỗi còn nhãn ("A. quả táo"
    vs "B. quả táo") — khác nhau nên câu lọt qua và bộ 4 option có hai đáp án y
    hệt được ghi vào bank. Frontend tự vẽ nhãn theo vị trí lên trên, nên người
    học thấy hai lựa chọn giống nhau.
    """
    stripped = _strip_option_labels(["A. quả táo", "B. quả táo", "C. quả cam", "D. quả nho"])
    assert stripped == ["quả táo", "quả táo", "quả cam", "quả nho"]


def test_validate_question_rejects_duplicate_hidden_behind_labels():
    q_data = {
        "quiz_type": "vocab",
        "prompt": "Chọn nghĩa đúng của: 苹果",
        "options": _strip_option_labels(
            ["A. quả táo", "B. quả táo", "C. quả cam", "D. quả nho"]
        ),
        "correct_index": 0,
        "explanation": "苹果 nghĩa là quả táo.",
    }
    valid, reason = _validate_question(q_data, "苹果")
    assert not valid
    assert "Duplicate" in reason


def test_validate_question_rejects_synonym_distractor():
    """Distractor trùng nghĩa đáp án = hai lựa chọn cùng đúng."""
    q_data = {
        "quiz_type": "vocab",
        "prompt": "Chọn nghĩa đúng của: 小",
        "options": ["nhỏ; bé; ít; trẻ", "Ít", "Cao", "Nhiều"],
        "correct_index": 0,
        "explanation": "小 nghĩa là nhỏ bé.",
    }
    valid, reason = _validate_question(q_data, "小")
    assert not valid
    assert "share a meaning" in reason


def test_validate_api_quiz_question_rejects_answer_revealing_hanzi():
    item = {
        "target_hanzi": "把",
        "prompt": "Chọn nghĩa đúng của: 把",
        "options": ["Đối với", "Ngoại trừ", "Đem cấu trúc 把", "Giống như"],
        "correct_index": 2,
        "explanation": "把 đảo tân ngữ lên trước động từ.",
    }
    valid, reason = _validate_api_quiz_question(item, "vocab")
    assert not valid
    assert "reveals" in reason


def test_validate_api_quiz_question_keeps_translation_with_shared_clauses():
    """Hai bản dịch khác nghĩa nhưng chung mệnh đề KHÔNG được coi là xung đột.

    Phép so tập nghĩa chỉ dành cho gloss. Áp cho translation thì 65,1% câu trong
    bank bị loại oan vì các đoạn dùng chung khung câu.
    """
    item = {
        "target_hanzi": "上学",
        "prompt": "Dịch đoạn sau: 今天我去上学。然后我回家吃饭。",
        "options": [
            "Hôm nay tôi đi học, sau đó về nhà ăn cơm",
            "Hôm nay tôi đi làm, sau đó về nhà ăn cơm",
            "Ngày mai tôi đi chơi, sau đó về nhà nghỉ",
            "Tuần sau tôi đi công tác, sau đó về nhà",
        ],
        "correct_index": 0,
        "explanation": "Đoạn nói về việc đi học rồi về nhà ăn cơm.",
    }
    assert _validate_api_quiz_question(item, "translation") == (True, "ok")
