"""Test cho /api/translation/items và /api/translation/grade.

Chạy: cd backend && python -m pytest tests/test_translation_router.py

Hai endpoint có mức bảo vệ khác nhau, và test khoá lại chính sự khác nhau đó:

  - ``/items`` gọi LLM -> tiêu quota chung với /tts, /pronunciation, /chat. Phải
    yêu cầu đăng nhập và rate-limit theo USER id (không theo IP: cả lớp học sau
    một NAT dùng chung IP thì khoá theo IP sẽ chặn oan lẫn nhau).
  - ``/grade`` chỉ so khớp chuỗi -> phải KHÔNG gọi LLM và KHÔNG bị rate-limit,
    vì người học nộp bài liên tục là hành vi bình thường.

Không chạm DB, không mạng: router gắn vào FastAPI rỗng, ``get_current_user`` và
``get_db`` bị override, ``take_items`` được patch.
"""

import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.db import get_db
from app.deps import get_current_user
from app.routers import translation as translation_module
from app.routers.translation import router as translation_router

_ITEM = {
    "sentence_cn": "我每天早上七点起床。",
    "sentence_vi": "Tôi thức dậy lúc bảy giờ mỗi sáng.",
    "pinyin": "wǒ měi tiān zǎo shang qī diǎn qǐ chuáng",
    "alt_cn": ["我每天早上七点钟起床。"],
    "alt_vi": ["Mỗi sáng tôi thức dậy vào lúc bảy giờ."],
    "key_words": ["起床", "七点"],
    "hsk_level": 1,
}


class _FakeUser:
    """Chỉ cần ``.id`` — đó là tất cả những gì limiter và LearningEvent dùng."""

    def __init__(self, user_id: str) -> None:
        self.id = user_id


class _FakeDb:
    """DB giả: ghi LearningEvent phải thất bại êm, không được làm mất phản hồi chấm
    bài. ``refresh`` để id là None nên response vẫn hợp schema."""

    def __init__(self) -> None:
        self.added = []
        self.commits = 0

    def add(self, obj):
        self.added.append(obj)

    def commit(self):
        self.commits += 1

    def refresh(self, obj):
        pass

    def rollback(self):
        pass


class TranslationRouterTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app = FastAPI()
        app.include_router(translation_router)
        cls.app = app
        cls.client = TestClient(app)

    def setUp(self):
        # Limiter là global module -> reset để lượt không rò giữa các ca.
        translation_module._items_limiter._hits.clear()
        self.db = _FakeDb()
        self.app.dependency_overrides.clear()
        self.app.dependency_overrides[get_db] = lambda: self.db

    def tearDown(self):
        self.app.dependency_overrides.clear()

    def _login(self, user_id: str = "user-1"):
        self.app.dependency_overrides[get_current_user] = lambda: _FakeUser(user_id)

    # --- Không đăng nhập ---------------------------------------------------

    def test_items_requires_auth(self):
        """Endpoint tiêu quota LLM: để công khai thì thành máy sinh nội dung miễn phí."""
        with patch.object(translation_module, "take_items", return_value=[_ITEM]) as m:
            res = self.client.post("/api/translation/items", json={"hsk_level": 1, "count": 3})
        self.assertEqual(res.status_code, 401, res.text)
        m.assert_not_called()

    def test_grade_requires_auth(self):
        res = self.client.post(
            "/api/translation/grade",
            json={"item": _ITEM, "user_answer": "x", "direction": "cn2vi"},
        )
        self.assertEqual(res.status_code, 401, res.text)

    # --- /items ------------------------------------------------------------

    def test_items_returns_pairs_for_authenticated_user(self):
        self._login()
        with patch.object(translation_module, "take_items", return_value=[_ITEM]) as m:
            res = self.client.post("/api/translation/items", json={"hsk_level": 2, "count": 1})
        self.assertEqual(res.status_code, 200, res.text)
        body = res.json()
        self.assertEqual(body["hsk_level"], 2)
        self.assertEqual(body["items"][0]["sentence_cn"], _ITEM["sentence_cn"])
        # Đáp án mẫu phải đi kèm: client cần đối chiếu ngay sau khi chấm.
        self.assertEqual(body["items"][0]["alt_vi"], _ITEM["alt_vi"])
        m.assert_called_once()

    def test_items_rejects_level_out_of_range(self):
        self._login()
        with patch.object(translation_module, "take_items", return_value=[_ITEM]) as m:
            res = self.client.post("/api/translation/items", json={"hsk_level": 9, "count": 3})
        self.assertEqual(res.status_code, 422, res.text)
        m.assert_not_called()

    def test_items_rejects_count_over_cap(self):
        self._login()
        with patch.object(translation_module, "take_items", return_value=[_ITEM]) as m:
            res = self.client.post("/api/translation/items", json={"hsk_level": 1, "count": 99})
        self.assertEqual(res.status_code, 422, res.text)
        m.assert_not_called()

    def test_items_maps_generation_failure_to_502(self):
        """Hết key / LLM trả rác là lỗi thượng nguồn, không phải lỗi client."""
        self._login()
        with patch.object(translation_module, "take_items", side_effect=RuntimeError("hết key")):
            res = self.client.post("/api/translation/items", json={"hsk_level": 1, "count": 3})
        self.assertEqual(res.status_code, 502, res.text)

    def test_items_reports_empty_result_instead_of_returning_nothing(self):
        self._login()
        with patch.object(translation_module, "take_items", return_value=[]):
            res = self.client.post("/api/translation/items", json={"hsk_level": 1, "count": 3})
        self.assertEqual(res.status_code, 502, res.text)

    def test_items_rate_limit_is_keyed_by_user(self):
        self._login("user-heavy")
        limit = translation_module._items_limiter.max_hits
        with patch.object(translation_module, "take_items", return_value=[_ITEM]):
            for _ in range(limit):
                res = self.client.post("/api/translation/items", json={"hsk_level": 1, "count": 1})
                self.assertEqual(res.status_code, 200, res.text)
            over = self.client.post("/api/translation/items", json={"hsk_level": 1, "count": 1})
        self.assertEqual(over.status_code, 429, over.text)

        # Người khác KHÔNG bị chặn lây: khoá là user id, không phải IP.
        self._login("user-light")
        with patch.object(translation_module, "take_items", return_value=[_ITEM]):
            res = self.client.post("/api/translation/items", json={"hsk_level": 1, "count": 1})
        self.assertEqual(res.status_code, 200, res.text)

    # --- /grade ------------------------------------------------------------

    def test_grade_never_calls_the_generator(self):
        """Chấm là so khớp đáp án mẫu (lựa chọn thay cho AI chấm): không được tốn
        thêm một lượt LLM nào cho mỗi câu nộp."""
        self._login()
        with patch.object(translation_module, "take_items") as m:
            res = self.client.post(
                "/api/translation/grade",
                json={
                    "item": _ITEM,
                    "user_answer": "Tôi thức dậy lúc bảy giờ mỗi sáng.",
                    "direction": "cn2vi",
                },
            )
        self.assertEqual(res.status_code, 200, res.text)
        self.assertTrue(res.json()["correct"])
        m.assert_not_called()

    def test_grade_is_not_rate_limited(self):
        """Nộp nhiều câu liên tiếp là luồng học bình thường — chặn ở đây làm hỏng phiên."""
        self._login("user-grader")
        payload = {"item": _ITEM, "user_answer": "sai", "direction": "cn2vi"}
        for _ in range(translation_module._items_limiter.max_hits + 5):
            res = self.client.post("/api/translation/grade", json=payload)
            self.assertEqual(res.status_code, 200, res.text)

    def test_grade_rejects_unknown_direction(self):
        self._login()
        res = self.client.post(
            "/api/translation/grade",
            json={"item": _ITEM, "user_answer": "x", "direction": "cn2v"},
        )
        self.assertEqual(res.status_code, 422, res.text)

    def test_grade_records_one_learning_event(self):
        self._login()
        res = self.client.post(
            "/api/translation/grade",
            json={"item": _ITEM, "user_answer": "我每天早上七点起床。", "direction": "vi2cn"},
        )
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(len(self.db.added), 1)
        event = self.db.added[0]
        self.assertEqual(event.item_type, "translation")
        self.assertEqual(event.skill, "production")
        self.assertEqual(event.correct, 1)
        # word_id phải None: câu do AI sinh không gắn với hàng Word nào, và
        # UserProgress khoá theo word_id nên gán bừa sẽ làm lệch điểm một từ khác.
        self.assertIsNone(event.word_id)

    def test_grade_still_answers_when_the_event_write_fails(self):
        """Chấm đã xong và không phụ thuộc DB. Mất một dòng thống kê không được làm
        người học mất phản hồi cho câu vừa nộp."""
        self._login()

        def _boom(_obj):
            raise RuntimeError("DB down")

        self.db.add = _boom
        res = self.client.post(
            "/api/translation/grade",
            json={
                "item": _ITEM,
                "user_answer": "Tôi thức dậy lúc bảy giờ mỗi sáng.",
                "direction": "cn2vi",
            },
        )
        self.assertEqual(res.status_code, 200, res.text)
        body = res.json()
        self.assertTrue(body["correct"])
        self.assertIsNone(body["event_id"])

    def test_grade_rejects_oversized_answer(self):
        self._login()
        res = self.client.post(
            "/api/translation/grade",
            json={"item": _ITEM, "user_answer": "a" * 5000, "direction": "cn2vi"},
        )
        self.assertEqual(res.status_code, 422, res.text)


if __name__ == "__main__":
    unittest.main()
