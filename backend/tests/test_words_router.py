"""Test tất định cho GET /api/words — lọc nhiều cấp HSK.

Chạy: cd backend && python -m pytest tests/test_words_router.py

Khóa hành vi: client (``getWords`` ở src/api-core.js) gửi param LẶP
``?level=1&level=3`` khi người học chọn nhiều cấp. Router phải trả hợp của các
cấp đó, không âm thầm lấy một cấp; giá trị ngoài 1..6 phải là 422 (không phải
500 — ``ge``/``le`` đặt sai chỗ trên ``list[int]`` làm pydantic ném TypeError).

Dùng SQLite in-memory + dependency_overrides nên không chạm DB thật.
"""

import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.models import Word
from app.routers.words import router as words_router


def _word(word_id: int, hanzi: str, level: int) -> Word:
    return Word(
        id=word_id,
        hanzi=hanzi,
        pinyin="test",
        meaning_vi=f"nghia {hanzi}",
        hsk_level=level,
    )


class WordsLevelFilterTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=cls.engine)
        cls.Session = sessionmaker(bind=cls.engine, autoflush=False, autocommit=False)

        with cls.Session() as db:
            db.add_all([
                _word(1, "一", 1),
                _word(2, "二", 1),
                _word(3, "三", 2),
                _word(4, "四", 3),
                # Từ chưa dịch: phải bị lọc ở mọi truy vấn.
                Word(id=5, hanzi="五", pinyin="wu", meaning_vi="", hsk_level=1),
            ])
            db.commit()

        app = FastAPI()
        app.include_router(words_router)
        app.dependency_overrides[get_db] = cls._override_db
        cls.client = TestClient(app)

    @classmethod
    def _override_db(cls):
        db = cls.Session()
        try:
            yield db
        finally:
            db.close()

    @classmethod
    def tearDownClass(cls):
        cls.engine.dispose()

    def _hanzi(self, query: str) -> list[str]:
        res = self.client.get(f"/api/words{query}")
        self.assertEqual(res.status_code, 200, res.text)
        return [w["hanzi"] for w in res.json()["words"]]

    def test_no_level_returns_all_translated_words(self):
        self.assertEqual(self._hanzi(""), ["一", "二", "三", "四"])

    def test_untranslated_word_is_filtered(self):
        self.assertNotIn("五", self._hanzi("?level=1"))

    def test_single_level(self):
        self.assertEqual(self._hanzi("?level=2"), ["三"])

    def test_repeated_level_params_return_union(self):
        """Hồi quy: khai báo scalar sẽ chỉ trả HSK 3 (giá trị cuối)."""
        self.assertEqual(self._hanzi("?level=1&level=3"), ["一", "二", "四"])

    def test_duplicate_values_are_deduped(self):
        self.assertEqual(self._hanzi("?level=1&level=1"), ["一", "二"])

    def test_counts_cover_selected_levels_only(self):
        res = self.client.get("/api/words?level=1&level=3")
        self.assertEqual(res.json()["counts"], {"HSK 1": 2, "HSK 3": 1})

    def test_out_of_range_level_is_422_not_500(self):
        for query in ("?level=0", "?level=7", "?level=1&level=9"):
            with self.subTest(query=query):
                self.assertEqual(self.client.get(f"/api/words{query}").status_code, 422)

    def test_non_integer_level_is_422(self):
        self.assertEqual(self.client.get("/api/words?level=abc").status_code, 422)


if __name__ == "__main__":
    unittest.main()
