from app.services.grammar_pool import (
    get_grammar_entry,
    load_grammar_pool,
    search_grammar_pool,
)


def test_pool_contains_exactly_577_contiguous_entries():
    pool = load_grammar_pool()
    assert pool["source"]["item_count"] == 577
    assert len(pool["items"]) == 577
    assert [item["number"] for item in pool["items"]] == list(range(1, 578))


def test_first_and_last_entries_match_pdf_headings():
    assert get_grammar_entry(1)["title"] == 'PHỦ ĐỊNH CỦA "有" VỚI "没"'
    assert get_grammar_entry(577)["title"] == 'PHÂN BIỆT "因此"、"因而"、"因为" VÀ "由于"'
    assert get_grammar_entry(0) is None
    assert get_grammar_entry(578) is None


def test_search_prioritizes_title_matches():
    matches = search_grammar_pool("因此", limit=10)
    assert matches
    assert any(item["number"] == 577 for item in matches)
    assert any("因此" in item["title"] for item in matches[:3])
