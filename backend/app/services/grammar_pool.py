"""Read-only access to the 577-entry PDF grammar reference pool."""

from __future__ import annotations

import json
import unicodedata
from functools import lru_cache
from pathlib import Path
from typing import Any


POOL_PATH = Path(__file__).resolve().parents[1] / "data" / "grammar_pool.json"


def _normalize(value: object) -> str:
    text = unicodedata.normalize("NFC", str(value or "")).casefold()
    return " ".join(text.split())


@lru_cache(maxsize=1)
def load_grammar_pool() -> dict[str, Any]:
    """Load and validate the canonical pool once per backend process."""

    payload = json.loads(POOL_PATH.read_text(encoding="utf-8"))
    items = payload.get("items")
    if payload.get("schema_version") != 1 or not isinstance(items, list):
        raise RuntimeError("grammar_pool.json has an unsupported schema")
    if len(items) != 577 or [item.get("number") for item in items] != list(range(1, 578)):
        raise RuntimeError("grammar_pool.json must contain contiguous entries 1..577")
    return payload


def get_grammar_entry(number: int) -> dict[str, Any] | None:
    """Return one entry by its PDF number."""

    if not 1 <= int(number) <= 577:
        return None
    return load_grammar_pool()["items"][int(number) - 1]


def _ranked_matches(query: str) -> list[dict[str, Any]]:
    """Every entry matching ``query``, most relevant first, with no result cap.

    Kept separate from :func:`search_grammar_pool` so paging can see the true
    match count: that function caps at 100 results for AI retrieval, which would
    otherwise pin ``total`` at 100 and leave later pages empty.
    """

    needle = _normalize(query)
    if not needle:
        return []

    matches: list[tuple[int, int, dict[str, Any]]] = []
    for item in load_grammar_pool()["items"]:
        title = _normalize(item.get("title"))
        body = _normalize(
            " ".join(
                str(item.get(field, ""))
                for field in ("meaning", "usage", "notes", "examples")
            )
        )
        if needle not in title and needle not in body:
            continue
        # Exact/substring title hits are more useful to an AI retriever than an
        # occurrence buried in an example sentence.
        score = 2 if needle in title else 1
        if title == needle:
            score = 3
        matches.append((-score, int(item["number"]), item))

    matches.sort(key=lambda row: (row[0], row[1]))
    return [item for _, _, item in matches]


def search_grammar_pool(query: str, limit: int = 20) -> list[dict[str, Any]]:
    """Search title and full structured content without changing source data."""

    capped_limit = max(1, min(int(limit), 100))
    return _ranked_matches(query)[:capped_limit]


def paginate_grammar_pool(
    query: str = "",
    page: int = 1,
    page_size: int = 24,
) -> tuple[list[dict[str, Any]], int, int, int]:
    """Return ``(items, total, page, page_count)`` for one page of the pool.

    An empty query lists every entry in PDF order; a non-empty query keeps the
    relevance order of :func:`_ranked_matches`. Paging deliberately bypasses
    :func:`search_grammar_pool` because its 100-result cap would pin ``total``
    at 100 and leave later pages of a broad query empty.

    ``page`` is clamped into range so a stale page number from the client falls
    back to the last real page rather than an empty response. ``page_count`` is
    returned rather than left to the caller: it must be derived from the same
    clamped ``page_size`` used to clamp ``page``, otherwise a caller that
    recomputes it from an unclamped value can advertise pages this function
    would silently clamp away.
    """

    safe_page_size = max(1, min(int(page_size), 100))
    if _normalize(query):
        matches = _ranked_matches(query)
    else:
        matches = load_grammar_pool()["items"]

    total = len(matches)
    page_count = max(1, -(-total // safe_page_size))
    safe_page = max(1, min(int(page), page_count))
    start = (safe_page - 1) * safe_page_size
    return matches[start : start + safe_page_size], total, safe_page, page_count
