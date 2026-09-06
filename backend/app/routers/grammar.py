"""API tra cứu thư viện ngữ pháp (577 mục trích từ PDF HSK 1-6).

Vì sao cần endpoint thay vì để frontend nạp thẳng ``src/data/grammar-pool.js``:
bundle đó ~6.9k dòng JSON, mỗi mục mang cả ``raw_text`` (trung bình ~1.1k ký tự)
nên client phải tải toàn bộ kho chỉ để xem một trang 24 thẻ. Ở đây danh sách chỉ
trả phần tóm tắt, ``raw_text`` để dành cho endpoint chi tiết.

Read-only và không phụ thuộc user: dữ liệu là tài liệu tham khảo tĩnh, giống
``/api/speech/scenarios``, nên không gắn ``resolve_user_id``. Không endpoint nào
ghi vào pool — nguồn sự thật vẫn là PDF qua ``scripts/import-grammar-pdf.py``.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from ..schemas import (
    GrammarEntryOut,
    GrammarPoolSourceOut,
    GrammarReferenceListOut,
)
from ..services.grammar_pool import (
    get_grammar_entry,
    load_grammar_pool,
    paginate_grammar_pool,
)

router = APIRouter(prefix="/api/grammar", tags=["grammar"])

DEFAULT_PAGE_SIZE = 24


@router.get("/reference", response_model=GrammarReferenceListOut)
def list_reference(
    # Trần 100/trang khớp với ``paginate_grammar_pool``; chặn ở tầng query để
    # client nhận 422 rõ ràng thay vì bị service âm thầm kẹp lại.
    q: str = Query(default="", max_length=120),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=100),
):
    """Một trang mục ngữ pháp. ``q`` rỗng = liệt kê theo thứ tự trong PDF."""

    # ``page_count`` lấy từ service, không tự tính lại: service kẹp page theo
    # page_size đã kẹp của nó, nên tính lại ở đây sẽ lệch nếu hai trần rời nhau.
    items, total, safe_page, page_count = paginate_grammar_pool(
        q, page=page, page_size=page_size
    )
    return GrammarReferenceListOut(
        items=items,
        total=total,
        page=safe_page,
        page_size=page_size,
        page_count=page_count,
        query=q,
        source=GrammarPoolSourceOut(**load_grammar_pool().get("source", {})),
    )


@router.get("/reference/{number}", response_model=GrammarEntryOut)
def get_reference(number: int):
    """Nội dung đầy đủ của một mục theo số thứ tự trong PDF (1..577)."""

    entry = get_grammar_entry(number)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Không có mục ngữ pháp số {number}")
    return GrammarEntryOut(**entry)
