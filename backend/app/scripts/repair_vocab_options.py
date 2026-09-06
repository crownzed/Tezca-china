"""Sửa các câu ``vocab`` đã ghi vào bank trước khi có cổng QA nghĩa.

Chạy từ thư mục backend:
    python -m app.scripts.repair_vocab_options --dry-run
    python -m app.scripts.repair_vocab_options

Ba lỗi được sửa, tất cả đo trên bank thật (5.881 câu vocab):

1. **Hai đáp án cùng đúng** (270 câu): distractor là ``meaning_vi`` của từ khác
   cùng cấp, mà 36,6% từ vựng trùng ít nhất một nghĩa tiếng Việt với một từ khác
   CÙNG cấp HSK. Câu 11675 hỏi 低 (``'thấp'``) mà có distractor ``'Thấp'`` (từ
   矮); câu 5341 hỏi 小 (``'nhỏ; bé; ít; trẻ'``) có distractor ``'Ít'`` (từ 少).
2. **Trùng lựa chọn sau chuẩn hoá** (14 câu): chỉ khác chữ hoa/thường —
   câu 8357 (可能) có cả ``'Có lẽ'`` và ``'có lẽ'``.
3. **Giải thích rỗng nghĩa** (5.594 câu = 95,1%): chỉ lặp lại
   ``hanzi · pinyin · nghĩa``, tức nhắc lại đúng thứ người học vừa chọn.

Cách sửa distractor: THAY tại chỗ bằng gloss của một từ khác cùng cấp không
xung đột, chứ không xoá câu. Xoá thì mất phủ từ vựng ở đúng những từ nhiều nghĩa
nhất (HSK4 mất 145 câu), và ``ensure_coverage`` sẽ sinh lại chậm hơn nhiều so
với một phép thay chuỗi. Câu không tìm được ứng viên nào mới bị xoá.

An toàn:
- ``correct_index`` và text của đáp án đúng KHÔNG bao giờ đổi -> mọi lượt trả lời
  đã lưu vẫn chấm đúng như cũ.
- ``option_word_ids`` được cập nhật cùng slot, nếu không thì bộ phân loại lỗi tra
  sai từ cho lựa chọn vừa thay.
- Chỉ chạm ``quiz_type='vocab'``: các dạng khác có lựa chọn là câu/đoạn, so theo
  tập nghĩa sẽ báo động giả (65,1% câu translation).
"""

from __future__ import annotations

import argparse
import logging
import random
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from sqlalchemy import select

from app.db import SessionLocal
from app.models import Question, QuizType, Word
from app.services.gloss_senses import (
    conflicting_option_indexes,
    duplicate_after_normalize,
    gloss_reveals_hanzi,
    has_cjk,
    normalize_text,
    senses,
)
from app.services.question_generator import QuestionGeneratorService

logger = logging.getLogger(__name__)


def _gloss(word: Word) -> str:
    return (word.meaning_vi or word.meaning_en or "").strip()


def _defect_tags(question: Question, target: Word | None) -> list[str]:
    """Nhãn lỗi của một câu vocab. Rỗng = câu sạch."""
    options = [str(item).strip() for item in (question.options or [])]
    correct_index = question.correct_index
    tags: list[str] = []
    if len(options) != 4 or not isinstance(correct_index, int):
        return ["malformed"]
    if not 0 <= correct_index < 4:
        return ["malformed"]
    if duplicate_after_normalize(options):
        tags.append("dup_norm")
    if conflicting_option_indexes(options, correct_index):
        tags.append("sense_conflict")
    if any(has_cjk(option) for option in options):
        tags.append("cjk_in_option")
    if target and gloss_reveals_hanzi(options[correct_index], target.hanzi):
        tags.append("answer_reveals_hanzi")
    return tags


def _bad_positions(options: list[str], correct_index: int) -> list[int]:
    """Vị trí các distractor cần thay. Không bao giờ trả về ``correct_index``.

    Ô trùng nhau sau chuẩn hoá: giữ ô xuất hiện TRƯỚC, thay ô sau — trừ khi ô sau
    chính là đáp án đúng, khi đó thay ô trước, vì text đáp án phải giữ nguyên để
    mọi lượt trả lời đã lưu vẫn chấm đúng.
    """
    bad = set(conflicting_option_indexes(options, correct_index))
    seen: dict[str, int] = {}
    for index, option in enumerate(options):
        key = normalize_text(option)
        if key in seen:
            bad.add(index if index != correct_index else seen[key])
        else:
            seen[key] = index
    for index, option in enumerate(options):
        if index != correct_index and has_cjk(option):
            bad.add(index)
    bad.discard(correct_index)
    return sorted(bad)


def _pick_replacement(
    options: list[str],
    correct_index: int,
    pool: list[Word],
    used_word_ids: set[int],
) -> Word | None:
    """Từ trong ``pool`` có gloss không xung đột với đáp án và mọi ô đang giữ.

    ``pool`` đã được xáo theo ``question.id`` ở ``_repair_options``: quét theo thứ
    tự DB thì mọi câu cùng cấp đều nhận đúng một distractor đầu bảng, tức 145 câu
    HSK4 hiện cùng một lựa chọn.
    """
    answer_senses = senses(options[correct_index])
    taken = {normalize_text(option) for option in options}
    for candidate in pool:
        if candidate.id in used_word_ids:
            continue
        gloss = _gloss(candidate)
        if not gloss or has_cjk(gloss):
            continue
        if normalize_text(gloss) in taken:
            continue
        if senses(gloss) & answer_senses:
            continue
        return candidate
    return None


def _repair_options(
    question: Question,
    target: Word | None,
    pool_by_level: dict[int, list[Word]],
) -> tuple[bool, str]:
    """Thay các distractor lỗi tại chỗ. Trả ``(đã_sửa, lý_do_nếu_không)``."""
    options = [str(item).strip() for item in (question.options or [])]
    correct_index = question.correct_index
    positions = _bad_positions(options, correct_index)
    if not positions:
        return False, "no_bad_position"

    metadata = dict(question.metadata_json or {})
    word_ids = list(metadata.get("option_word_ids") or [None] * 4)
    if len(word_ids) != 4:
        word_ids = [None] * 4
    used = {wid for wid in word_ids if wid is not None}
    if target:
        used.add(target.id)

    # Xáo pool theo id câu: tất định (chạy lại cho kết quả y hệt) nhưng không dồn
    # mọi câu cùng cấp vào một distractor. Ưu tiên từ CÙNG từ loại với từ đích,
    # giống chính sách của ``_options_with_words``, để lựa chọn còn hợp ngữ pháp.
    pool = list(pool_by_level.get(question.level or 0, []))
    random.Random(question.id).shuffle(pool)
    if target and target.pos:
        pool.sort(key=lambda word: word.pos != target.pos)

    for position in positions:
        replacement = _pick_replacement(options, correct_index, pool, used)
        if replacement is None:
            return False, "no_candidate"
        options[position] = _gloss(replacement)
        word_ids[position] = replacement.id
        used.add(replacement.id)

    if _defect_tags_for(options, correct_index):
        return False, "still_defective"

    question.options = options
    metadata["option_word_ids"] = word_ids
    metadata["repaired"] = "vocab_options_v1"
    question.metadata_json = metadata
    return True, ""


def _defect_tags_for(options: list[str], correct_index: int) -> list[str]:
    """``_defect_tags`` nhưng nhận list rời — dùng để tự kiểm sau khi sửa."""
    tags: list[str] = []
    if duplicate_after_normalize(options):
        tags.append("dup_norm")
    if conflicting_option_indexes(options, correct_index):
        tags.append("sense_conflict")
    if any(index != correct_index and has_cjk(option) for index, option in enumerate(options)):
        tags.append("cjk_in_option")
    return tags


def _repair_explanation(question: Question, target: Word | None, generator) -> bool:
    """Viết lại giải thích stub bằng phần DẠY lấy từ ``words``.

    Nhận diện stub theo HÌNH DẠNG (``hanzi · pinyin · <gì đó>``) chứ không so
    khớp nguyên văn với gloss hiện tại: 3 câu có stub chứa gloss CŨ (câu 2556 giữ
    ``'把 · bǎ · Đem (cấu trúc 把)'`` sau khi ``fix_word_glosses`` đã sửa gloss),
    so nguyên văn sẽ bỏ sót đúng những câu cần sửa nhất.

    Câu do LLM viết (58,9% nhóm ``ai_bank_upgrade_llm`` có kèm câu ví dụ) không
    có hình dạng này nên không bị đè.
    """
    if not target:
        return False
    current = (question.explanation or "").strip()
    parts = [part.strip() for part in current.split(" · ")]
    if len(parts) != 3 or parts[0] != target.hanzi or parts[1] != (target.pinyin or ""):
        return False
    enriched = generator._vocab_explanation(target)
    if enriched.strip() == current:
        return False
    question.explanation = enriched
    return True


def _resync_option_texts(question: Question, word_by_id: dict[int, Word]) -> int:
    """Đồng bộ text của các lựa chọn với gloss HIỆN TẠI của từ tương ứng.

    Câu template ghi text bằng cách copy ``meaning_vi`` của từ, và
    ``option_word_ids`` lưu lại từ nào ở ô nào — kiểm trên bank: cả 5.594 câu
    ``source=generated`` đều khớp nguyên văn 4/4 ô. Nên một ô lệch gloss nghĩa là
    gloss đã được sửa SAU khi câu được sinh, và ô đó đang giữ bản cũ: sau
    ``fix_word_glosses`` có 21 ô như vậy, trong đó 4 ô là ĐÁP ÁN (câu 2556 vẫn
    hiển thị ``'Đem (cấu trúc 把)'`` — vẫn tự lộ chữ Hán đang hỏi).

    Chỉ đổi TEXT, không đổi ``correct_index``, nên chấm điểm theo index không hề
    thay đổi. Chỉ chạy khi CẢ 4 ô đều map được: câu do LLM sinh chỉ map ô đáp án
    và text của nó là câu chữ tự do, không phải bản copy gloss.
    """
    options = [str(item).strip() for item in (question.options or [])]
    word_ids = (question.metadata_json or {}).get("option_word_ids") or []
    if len(options) != 4 or len(word_ids) != 4:
        return 0
    if any(wid is None or wid not in word_by_id for wid in word_ids):
        return 0

    changed = 0
    for index, wid in enumerate(word_ids):
        gloss = _gloss(word_by_id[wid])
        if gloss and options[index] != gloss:
            options[index] = gloss
            changed += 1
    if not changed:
        return 0
    question.options = options
    return changed


def repair(dry_run: bool, limit: int | None) -> dict:
    stats: Counter = Counter()
    tag_counts: Counter = Counter()
    skip_reasons: Counter = Counter()
    per_level: Counter = Counter()

    with SessionLocal() as db:
        generator = QuestionGeneratorService(db)
        words = db.scalars(select(Word)).all()
        word_by_id = {word.id: word for word in words}
        pool_by_level: dict[int, list[Word]] = defaultdict(list)
        for word in words:
            if _gloss(word):
                pool_by_level[word.hsk_level or 0].append(word)

        rows = db.scalars(
            select(Question).where(Question.quiz_type == QuizType.vocab)
        ).all()
        stats["scanned"] = len(rows)

        for question in rows:
            target = word_by_id.get(question.word_id) if question.word_id else None

            # Đồng bộ text theo gloss hiện tại TRƯỚC khi phát hiện lỗi: gloss vừa
            # được ``fix_word_glosses`` sửa, nên đánh giá trên text cũ sẽ tìm lỗi
            # ở dữ liệu đã lỗi thời (và bỏ sót lỗi mới sinh ra do đồng bộ).
            resynced = _resync_option_texts(question, word_by_id)
            if resynced:
                stats["options_resynced"] += 1
                stats["option_slots_resynced"] += resynced

            tags = _defect_tags(question, target)
            if tags:
                stats["defective"] += 1
                per_level[question.level] += 1
                for tag in tags:
                    tag_counts[tag] += 1
                fixed, reason = _repair_options(question, target, pool_by_level)
                if fixed:
                    stats["options_fixed"] += 1
                else:
                    stats["options_unfixable"] += 1
                    skip_reasons[reason] += 1

            if _repair_explanation(question, target, generator):
                stats["explanations_rewritten"] += 1

            if limit and stats["options_fixed"] >= limit:
                break

        if dry_run:
            db.rollback()
        else:
            db.commit()

    return {
        "stats": stats,
        "tags": tag_counts,
        "skips": skip_reasons,
        "levels": per_level,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Sửa distractor trùng nghĩa và giải thích stub của câu vocab"
    )
    parser.add_argument("--dry-run", action="store_true", help="Chỉ báo cáo, không ghi DB")
    parser.add_argument(
        "--limit", type=int, default=None, help="Dừng sau N câu được sửa (để thử)"
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO, format="%(levelname)s %(message)s", stream=sys.stdout, force=True
    )

    report = repair(args.dry_run, args.limit)
    stats = report["stats"]
    logger.info("Quét %s câu vocab, %s câu có lỗi.", stats["scanned"], stats["defective"])
    logger.info("  Lỗi theo loại : %s", dict(report["tags"]))
    logger.info("  Lỗi theo cấp  : %s", dict(sorted(report["levels"].items())))
    logger.info(
        "  %s %s ô lệch gloss ở %s câu",
        "Sẽ đồng bộ" if args.dry_run else "Đã đồng bộ",
        stats["option_slots_resynced"],
        stats["options_resynced"],
    )
    logger.info(
        "  %s options cho %s câu (%s câu không sửa được: %s)",
        "Sẽ thay" if args.dry_run else "Đã thay",
        stats["options_fixed"],
        stats["options_unfixable"],
        dict(report["skips"]) or "-",
    )
    logger.info(
        "  %s giải thích stub cho %s câu",
        "Sẽ viết lại" if args.dry_run else "Đã viết lại",
        stats["explanations_rewritten"],
    )
    if args.dry_run:
        logger.info("Chạy lại không có --dry-run để ghi vào DB.")


if __name__ == "__main__":
    main()
