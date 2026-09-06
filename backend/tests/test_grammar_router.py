"""Test tất định cho /api/grammar/reference — phân trang + tra cứu chi tiết.

Khóa hai hành vi dễ vỡ khi sửa sau này:

  * danh sách KHÔNG trả ``raw_text`` (trung bình ~1.1k ký tự/mục — trả kèm 24 thẻ
    là phình payload vô ích), còn chi tiết thì PHẢI có;
  * ``search_grammar_pool`` kẹp ``limit`` ở 100 nên nếu router gọi trực tiếp hàm
    đó thì truy vấn khớp >100 mục sẽ bị cắt âm thầm; phân trang phải đi qua
    ``paginate_grammar_pool``.

Không chạm DB: pool là JSON tĩnh, router read-only nên chỉ cần TestClient.
"""

import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers.grammar import router as grammar_router
from app.services.grammar_pool import load_grammar_pool

TOTAL_ENTRIES = 577


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(grammar_router)
    return TestClient(app)


class GrammarReferenceListTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = _client()

    def test_empty_query_lists_pool_in_pdf_order(self):
        body = self.client.get("/api/grammar/reference").json()
        self.assertEqual(body["total"], TOTAL_ENTRIES)
        self.assertEqual(body["page"], 1)
        self.assertEqual(body["page_size"], 24)
        self.assertEqual(body["page_count"], 25)  # ceil(577 / 24)
        self.assertEqual([item["number"] for item in body["items"]], list(range(1, 25)))
        self.assertEqual(body["source"]["item_count"], TOTAL_ENTRIES)
        self.assertEqual(body["source"]["pages"], 564)

    def test_neither_list_nor_detail_leaks_raw_text(self):
        # raw_text là khối thô chưa tách, không client nào render — giữ nó ngoài
        # cả hai response. Chi tiết chỉ thêm notes/examples so với summary.
        first = self.client.get("/api/grammar/reference").json()["items"][0]
        self.assertNotIn("raw_text", first)

        detail = self.client.get("/api/grammar/reference/1").json()
        self.assertNotIn("raw_text", detail)
        self.assertEqual(detail["title"], 'PHỦ ĐỊNH CỦA "有" VỚI "没"')
        self.assertEqual(
            set(detail) - set(first), {"notes", "examples"}
        )

    def test_every_entry_has_renderable_content_without_raw_text(self):
        # ReferenceView chỉ render meaning/usage/notes/examples. Nếu một mục nào
        # rỗng cả bốn trường thì bỏ raw_text khỏi API sẽ tạo màn chi tiết trắng.
        blank = [
            item["number"]
            for item in load_grammar_pool()["items"]
            if not any(
                str(item.get(field, "")).strip()
                for field in ("meaning", "usage", "notes", "examples")
            )
        ]
        self.assertEqual(blank, [])

    def test_last_page_holds_the_remainder(self):
        body = self.client.get("/api/grammar/reference", params={"page": 25}).json()
        self.assertEqual(body["page"], 25)
        # 577 = 24 * 24 + 1 → trang cuối đúng 1 mục.
        self.assertEqual([item["number"] for item in body["items"]], [577])

    def test_out_of_range_page_clamps_to_last_page(self):
        body = self.client.get("/api/grammar/reference", params={"page": 9999}).json()
        self.assertEqual(body["page"], 25)
        self.assertEqual(len(body["items"]), 1)

    def test_pages_cover_every_entry_exactly_once(self):
        seen: list[int] = []
        for page in range(1, 26):
            body = self.client.get(
                "/api/grammar/reference", params={"page": page, "page_size": 24}
            ).json()
            seen.extend(item["number"] for item in body["items"])
        self.assertEqual(seen, list(range(1, TOTAL_ENTRIES + 1)))

    def test_query_ranks_title_matches_first(self):
        body = self.client.get("/api/grammar/reference", params={"q": "因此"}).json()
        self.assertGreater(body["total"], 0)
        self.assertEqual(body["query"], "因此")
        self.assertTrue(any("因此" in item["title"] for item in body["items"][:3]))
        self.assertIn(577, [item["number"] for item in body["items"]])

    def test_broad_query_pages_beyond_the_100_result_search_cap(self):
        # "的" xuất hiện khắp nội dung nên số mục khớp vượt xa trần limit=100 của
        # search_grammar_pool. Nếu router gọi thẳng hàm đó, total sẽ đứng ở 100
        # và các trang sau rỗng.
        body = self.client.get("/api/grammar/reference", params={"q": "的"}).json()
        self.assertGreater(body["total"], 100)
        self.assertGreater(body["page_count"], 5)

        last = self.client.get(
            "/api/grammar/reference", params={"q": "的", "page": body["page_count"]}
        ).json()
        self.assertTrue(last["items"])

    def test_no_match_returns_empty_page_not_error(self):
        body = self.client.get(
            "/api/grammar/reference", params={"q": "zzz-khong-ton-tai-zzz"}
        ).json()
        self.assertEqual(body["total"], 0)
        self.assertEqual(body["items"], [])
        self.assertEqual(body["page"], 1)
        self.assertEqual(body["page_count"], 1)

    def test_invalid_paging_params_are_422(self):
        self.assertEqual(
            self.client.get("/api/grammar/reference", params={"page": 0}).status_code, 422
        )
        self.assertEqual(
            self.client.get("/api/grammar/reference", params={"page_size": 101}).status_code,
            422,
        )
        self.assertEqual(
            self.client.get("/api/grammar/reference", params={"page_size": 0}).status_code,
            422,
        )


class GrammarReferenceDetailTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = _client()

    def test_first_and_last_entries_are_reachable(self):
        self.assertEqual(
            self.client.get("/api/grammar/reference/577").json()["title"],
            'PHÂN BIỆT "因此"、"因而"、"因为" VÀ "由于"',
        )
        self.assertEqual(self.client.get("/api/grammar/reference/1").status_code, 200)

    def test_detail_matches_the_canonical_pool_record(self):
        expected = load_grammar_pool()["items"][41]  # mục số 42
        got = self.client.get("/api/grammar/reference/42").json()
        for field in ("id", "number", "title", "page_start", "page_end"):
            self.assertEqual(got[field], expected[field], field)

    def test_out_of_range_numbers_are_404(self):
        self.assertEqual(self.client.get("/api/grammar/reference/0").status_code, 404)
        self.assertEqual(self.client.get("/api/grammar/reference/578").status_code, 404)
        self.assertEqual(self.client.get("/api/grammar/reference/-3").status_code, 404)

    def test_non_numeric_number_is_422(self):
        self.assertEqual(self.client.get("/api/grammar/reference/abc").status_code, 422)


if __name__ == "__main__":
    unittest.main()
