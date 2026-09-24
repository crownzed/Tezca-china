"""Regression tests for custom-vocabulary and passage quiz generation.

The router is mounted on a small FastAPI app and all generation calls are
mocked.  Persistence assertions use only an in-memory SQLite database; draft
routes must never create rows.
"""

import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.models import LearningSession, Question, Word
from app.routers import custom_vocab as custom_vocab_module
from app.services import llm_generator_service


class _FakeUser:
    def __init__(self, user_id: str = "user-1") -> None:
        self.id = user_id


def _draft_question(
    *,
    quiz_type: str = "vocab",
    prompt: str = "Câu hỏi mẫu",
    correct_index=0,
    options=None,
    subtype: str = "",
) -> dict:
    return {
        "quiz_type": quiz_type,
        "question_subtype": subtype,
        "prompt": prompt,
        "options": options if options is not None else ["A", "B", "C", "D"],
        "correct_index": correct_index,
        "explanation": "Giải thích mẫu.",
    }


def _passage_question(
    *,
    prompt: str = "Thông tin nào đúng?",
    correct_index=0,
    options=None,
    subtype: str = "info_extraction",
    quiz_type: str = "reading",
) -> dict:
    return _draft_question(
        quiz_type=quiz_type,
        prompt=prompt,
        correct_index=correct_index,
        options=options,
        subtype=subtype,
    )


def _vocab_data() -> dict:
    return {
        "words": [
            {
                "hanzi": "学习",
                "pinyin": "xuéxí",
                "meaning_vi": "học",
                "hsk_level": 3,
                "pos": "động từ",
                "questions": [
                    _draft_question(prompt="giữ chỉ số hợp lệ", correct_index=2),
                    _draft_question(prompt="chỉ số âm", correct_index=-1),
                    _draft_question(prompt="chỉ số quá lớn", correct_index=4),
                    _draft_question(prompt="chỉ số dạng chuỗi", correct_index="1"),
                    _draft_question(prompt="chỉ số rỗng", correct_index=None),
                    _draft_question(
                        prompt="ba lựa chọn bị loại", options=["A", "B", "C"]
                    ),
                ],
            }
        ]
    }


class CustomVocabRouterTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=cls.engine)
        cls.Session = sessionmaker(bind=cls.engine, autoflush=False, autocommit=False)

        app = FastAPI()
        app.include_router(custom_vocab_module.router)
        cls.app = app
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        cls.engine.dispose()

    def setUp(self):
        self.db = self.Session()
        # Keep tests independent even though the in-memory engine is shared by
        # the class.  Questions are removed before their optional Word rows.
        self.db.query(Question).delete()
        self.db.query(LearningSession).delete()
        self.db.query(Word).delete()
        self.db.commit()

        self.app.dependency_overrides.clear()
        # Use the exact dependency objects imported by custom_vocab.py.  The
        # real configured engine is therefore never reached by these tests.
        self.app.dependency_overrides[custom_vocab_module.get_db] = lambda: self.db
        self.app.dependency_overrides[custom_vocab_module.get_current_user] = (
            lambda: _FakeUser()
        )

    def tearDown(self):
        self.app.dependency_overrides.clear()
        self.db.rollback()
        self.db.close()

    def _assert_no_draft_rows(self):
        self.assertEqual(self.db.query(Question).count(), 0)
        self.assertEqual(self.db.query(LearningSession).count(), 0)
        self.assertEqual(self.db.query(Word).count(), 0)

    def test_draft_requires_authentication(self):
        self.app.dependency_overrides.pop(custom_vocab_module.get_current_user)
        with patch.object(
            custom_vocab_module,
            "generate_exercises_for_vocab",
            return_value=_vocab_data(),
        ) as generate:
            response = self.client.post(
                "/api/custom-vocab/draft/vocab", json={"words": ["学习"]}
            )

        self.assertEqual(response.status_code, 401, response.text)
        generate.assert_not_called()
        self._assert_no_draft_rows()

    def test_vocab_draft_filters_options_normalizes_indices_and_is_metadata_only(self):
        with patch.object(
            custom_vocab_module,
            "generate_exercises_for_vocab",
            return_value=_vocab_data(),
        ) as generate:
            response = self.client.post(
                "/api/custom-vocab/draft/vocab", json={"words": ["学习"]}
            )

        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["source"], "vocab")
        self.assertIsNone(body["requested_count"])
        self.assertEqual(body["generated_count"], 5)
        self.assertFalse(body["partial"])
        self.assertEqual(len(body["questions"]), 5)
        self.assertEqual(
            [question["correct_index"] for question in body["questions"]],
            [2, 0, 0, 0, 0],
        )
        self.assertTrue(all(len(question["options"]) == 4 for question in body["questions"]))
        self.assertTrue(all(question["level"] == 3 for question in body["questions"]))
        generate.assert_called_once_with(["学习"])
        self._assert_no_draft_rows()

    def test_vocab_draft_returns_400_when_filtering_leaves_no_questions(self):
        data = {
            "words": [
                {
                    "hanzi": "学习",
                    "hsk_level": 3,
                    "questions": [
                        _draft_question(options=["A", "B", "C"]),
                    ],
                }
            ]
        }
        with patch.object(
            custom_vocab_module,
            "generate_exercises_for_vocab",
            return_value=data,
        ):
            response = self.client.post(
                "/api/custom-vocab/draft/vocab", json={"words": ["学习"]}
            )

        self.assertEqual(response.status_code, 400, response.text)
        self._assert_no_draft_rows()

    def test_passage_draft_forwards_parameters_reports_partial_and_normalizes_indices(self):
        text = "我每天早上在学校学习中文。"
        question_types = ["info_extraction", "error_id"]
        data = {
            "quiz_title": "Đọc hiểu",
            "questions": [
                _passage_question(prompt="giữ chỉ số ba", correct_index=3),
                _passage_question(prompt="chỉ số âm", correct_index=-1),
                _passage_question(prompt="chỉ số chuỗi", correct_index="1"),
                _passage_question(prompt="chỉ số None", correct_index=None),
                _passage_question(
                    prompt="năm lựa chọn bị loại",
                    options=["A", "B", "C", "D", "E"],
                ),
            ],
        }
        with patch.object(
            custom_vocab_module,
            "generate_questions_for_passage",
            return_value=data,
        ) as generate:
            response = self.client.post(
                "/api/custom-vocab/draft/passage",
                json={
                    "text": text,
                    "hsk_level": 4,
                    "count": 5,
                    "question_types": question_types,
                },
            )

        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["requested_count"], 5)
        self.assertEqual(body["generated_count"], 4)
        self.assertTrue(body["partial"])
        self.assertEqual(body["passage"], text)
        self.assertEqual(
            [question["correct_index"] for question in body["questions"]],
            [3, 0, 0, 0],
        )
        self.assertTrue(all(len(question["options"]) == 4 for question in body["questions"]))
        generate.assert_called_once_with(
            text,
            hsk_level=4,
            count=5,
            question_subtypes=question_types,
        )
        self._assert_no_draft_rows()

    def test_passage_draft_reports_full_result(self):
        text = "我每天在学校学习中文。"
        data = {
            "questions": [
                _passage_question(prompt="第一题", correct_index=1),
                _passage_question(prompt="第二题", correct_index=0),
            ]
        }
        with patch.object(
            custom_vocab_module,
            "generate_questions_for_passage",
            return_value=data,
        ):
            response = self.client.post(
                "/api/custom-vocab/draft/passage",
                json={"text": text, "hsk_level": 2, "count": 2},
            )

        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["requested_count"], 2)
        self.assertEqual(body["generated_count"], 2)
        self.assertFalse(body["partial"])
        self._assert_no_draft_rows()

    def test_passage_draft_returns_400_when_no_valid_questions_remain(self):
        text = "我每天在学校学习中文。"
        with patch.object(
            custom_vocab_module,
            "generate_questions_for_passage",
            return_value={"questions": []},
        ) as generate:
            response = self.client.post(
                "/api/custom-vocab/draft/passage",
                json={"text": text, "hsk_level": 2, "count": 3},
            )

        self.assertEqual(response.status_code, 400, response.text)
        generate.assert_called_once_with(
            text,
            hsk_level=2,
            count=3,
            question_subtypes=None,
        )
        self._assert_no_draft_rows()

    def test_topic_draft_forwards_hsk_level_to_both_generation_stages(self):
        topic = "旅行"
        passage = "我和朋友昨天去了北京。我们参观了故宫。"
        question_types = ["info_extraction"]
        data = {
            "questions": [_passage_question(prompt="旅行地点", correct_index=2)]
        }
        with patch.object(
            custom_vocab_module,
            "generate_passage_for_topic",
            return_value=passage,
        ) as passage_generator, patch.object(
            custom_vocab_module,
            "generate_questions_for_passage",
            return_value=data,
        ) as question_generator:
            response = self.client.post(
                "/api/custom-vocab/draft/topic",
                json={
                    "topic": topic,
                    "hsk_level": 5,
                    "count": 3,
                    "question_types": question_types,
                },
            )

        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["source"], "topic")
        self.assertEqual(body["passage"], passage)
        self.assertEqual(body["quiz_title"], f"Chu de: {topic}")
        self.assertEqual(body["requested_count"], 3)
        self.assertEqual(body["generated_count"], 1)
        self.assertTrue(body["partial"])
        passage_generator.assert_called_once_with(topic, hsk_level=5)
        question_generator.assert_called_once_with(
            passage,
            hsk_level=5,
            count=3,
            question_subtypes=question_types,
        )
        self._assert_no_draft_rows()

    def test_real_passage_service_rejects_malformed_llm_questions_and_reports_partial(self):
        """Only the service's API call is mocked; its strict validator runs."""
        valid = _passage_question(
            prompt="Đoạn văn nói về nơi nào?",
            correct_index=1,
            options=["trường học", "bệnh viện", "nhà ga", "công viên"],
        )
        duplicate_options = _passage_question(
            prompt="câu trùng lựa chọn",
            options=["A", "A", "C", "D"],
        )
        short_options = _passage_question(
            prompt="câu thiếu lựa chọn",
            options=["A", "B", "C"],
        )
        invalid_index = _passage_question(
            prompt="câu có chỉ số sai",
            correct_index=9,
        )
        api_result = {
            "quiz_title": "Bài kiểm tra nghiêm ngặt",
            "questions": [valid, duplicate_options, short_options, invalid_index],
        }
        with patch.object(
            llm_generator_service,
            "_call_api",
            return_value=api_result,
        ) as call_api:
            response = self.client.post(
                "/api/custom-vocab/draft/passage",
                json={
                    "text": "我每天在学校学习中文。",
                    "hsk_level": 4,
                    "count": 3,
                    "question_types": ["info_extraction"],
                },
            )

        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["generated_count"], 1)
        self.assertEqual(body["requested_count"], 3)
        self.assertTrue(body["partial"])
        self.assertEqual(len(body["questions"]), 1)
        self.assertEqual(body["questions"][0]["prompt"], valid["prompt"])
        self.assertEqual(body["questions"][0]["correct_index"], 1)
        call_api.assert_called_once()
        self._assert_no_draft_rows()

    def test_legacy_text_generation_forwards_parameters_and_persists_repaired_rows(self):
        text = "我每天在学校学习中文。"
        question_types = ["info_extraction", "contextual_translation"]
        questions = [
            _passage_question(prompt="保留合法索引", correct_index=2),
            _passage_question(prompt="负数索引", correct_index=-1),
            _passage_question(prompt="超范围索引", correct_index=4),
            _passage_question(prompt="字符串索引", correct_index="1"),
            _passage_question(
                prompt="三项选项应跳过",
                options=["A", "B", "C"],
            ),
        ]
        with patch.object(
            custom_vocab_module,
            "generate_questions_for_passage",
            return_value={"questions": questions},
        ) as generate:
            response = self.client.post(
                "/api/custom-vocab/generate-from-text",
                json={
                    "text": text,
                    "hsk_level": 6,
                    "count": 4,
                    "question_types": question_types,
                },
            )

        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertIsInstance(body["session_id"], int)
        self.assertEqual(len(body["questions"]), 4)
        self.assertEqual(
            [question["correct_index"] for question in body["questions"]],
            [2, 0, 0, 0],
        )
        self.assertTrue(all(question["level"] == 6 for question in body["questions"]))
        generate.assert_called_once_with(
            text,
            hsk_level=6,
            count=4,
            question_subtypes=question_types,
        )

        stored_questions = self.db.execute(
            select(Question).order_by(Question.id)
        ).scalars().all()
        self.assertEqual(len(stored_questions), 4)
        self.assertEqual([question.level for question in stored_questions], [6] * 4)
        self.assertEqual(
            [question.correct_index for question in stored_questions],
            [2, 0, 0, 0],
        )
        self.assertTrue(all(len(question.options) == 4 for question in stored_questions))

        sessions = self.db.execute(select(LearningSession)).scalars().all()
        self.assertEqual(len(sessions), 1)
        self.assertEqual(sessions[0].user_id, "user-1")
        self.assertEqual(sessions[0].session_type, "passage_quiz")
        self.assertEqual(body["session_id"], sessions[0].id)


if __name__ == "__main__":
    unittest.main()
