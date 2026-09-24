"""Offline regression tests for the Realtime dictionary tool."""

import json
import unittest
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.models import Example, Word
from app.realtime import tools


class LookupWordTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        Base.metadata.create_all(bind=cls.engine)
        cls.Session = sessionmaker(bind=cls.engine)
        with cls.Session() as db:
            db.add_all([
                Word(hanzi="努", pinyin="nǔ", meaning_vi="cố", hsk_level=4),
                Word(hanzi="努力", pinyin="nǔlì", meaning_vi="cố gắng", hsk_level=3,
                     examples=[Example(sentence_cn="他很努力。", sentence_vi="Bạn ấy chăm chỉ.")]),
                Word(hanzi="努力", pinyin="nǔlì", meaning_vi="nỗ lực", hsk_level=5),
                Word(hanzi="学习", pinyin="xuéxí", meaning_vi="học", hsk_level=1),
                Word(hanzi="学%", pinyin="xué", meaning_vi="dấu phần trăm", hsk_level=1),
                Word(hanzi="学_", pinyin="xué", meaning_vi="dấu gạch dưới", hsk_level=1),
            ])
            db.commit()

    @classmethod
    def tearDownClass(cls):
        cls.engine.dispose()

    def _lookup(self, word):
        with patch.object(tools, "SessionLocal", self.Session):
            return json.loads(tools.lookup_word(word))

    def test_longest_input_prefix_wins_over_shorter_and_unrelated_words(self):
        result = self._lookup("努力学习")
        self.assertEqual(result["hanzi"], "努力")
        self.assertEqual(result["meaning_vi"], "cố gắng")
        self.assertEqual(result["examples"], [
            {"cn": "他很努力。", "vi": "Bạn ấy chăm chỉ."}
        ])

    def test_exact_match_and_tie_break_by_hsk_level(self):
        self.assertEqual(self._lookup("努力")["hsk_level"], 3)
        self.assertEqual(self._lookup("  学习  ")["hanzi"], "学习")

    def test_like_wildcards_are_literal(self):
        self.assertEqual(self._lookup("学%后缀")["hanzi"], "学%")
        self.assertEqual(self._lookup("学_后缀")["hanzi"], "学_")
        self.assertEqual(self._lookup("%努力"), {"not_found": True, "word": "%努力"})

    def test_invalid_input_never_queries_database(self):
        with patch.object(tools, "SessionLocal", side_effect=AssertionError("queried")):
            for word in (None, "", " " * 4, "字" * 33):
                with self.subTest(word=word):
                    self.assertIn("error", json.loads(tools.lookup_word(word)))


if __name__ == "__main__":
    unittest.main()
