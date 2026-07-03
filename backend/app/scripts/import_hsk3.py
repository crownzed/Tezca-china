"""Reconcile the ``words`` table against the authoritative HSK 3.0 wordlist.

Source: drkameleon/complete-hsk-vocabulary (``newest`` = HSK 3.0, 2021),
vendored at ``backend/app/data/hsk3/{1..6}.min.json``. Each entry:
  s  -> simplified hanzi
  r  -> radical
  p  -> list of POS codes (e.g. ["v","vn","b"])
  f[0].i.y -> pinyin with tone marks
  f[0].m   -> list of English glosses

Reconciliation is idempotent and preserves curated data:
  * A word already in the DB (matched by hanzi) keeps its ``meaning_vi`` and
    examples. Missing pinyin / pos / radical / meaning_en are backfilled, and
    its ``hsk_level`` is moved to the official level (unless that would collide
    with an existing row already at the official level).
  * A brand-new word is inserted with ``meaning_vi=""`` (pending translation),
    ``meaning_en`` = joined English glosses, and ``source="hsk3-official"``.

Run:  python -m app.scripts.import_hsk3        (from the backend/ directory)
"""
from __future__ import annotations

import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from sqlalchemy import func, select

from app.db import SessionLocal, init_db
from app.models import Word

DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "hsk3"
LEVELS = [1, 2, 3, 4, 5, 6]
OFFICIAL_SOURCE = "hsk3-official"


def _pick_form(forms: list[dict]) -> dict:
    """Chọn form "đời thường" nhất trong nhiều form của một chữ.

    Nguồn HSK 3.0 thường liệt kê form danh từ riêng / họ người TRƯỚC (pinyin viết
    HOA, ví dụ ``Chē`` cho 车, ``Dàxué`` cho 大学) rồi mới tới nghĩa thông dụng.
    Lấy ``f[0]`` mù quáng sẽ ra "họ Xa" thay vì "xe". Heuristic: ưu tiên form có
    pinyin bắt đầu bằng CHỮ THƯỜNG (nghĩa phổ thông); trong số đó chọn form nhiều
    nghĩa nhất. Nếu tất cả đều viết hoa (chỉ là danh từ riêng thật) thì giữ form
    đầu.
    """
    if not forms:
        return {}

    def first_alpha_is_lower(form: dict) -> bool:
        pinyin = (form.get("i") or {}).get("y") or ""
        for ch in pinyin:
            if ch.isalpha():
                return ch.islower()
        return False

    common = [f for f in forms if first_alpha_is_lower(f)]
    pool = common or forms
    return max(pool, key=lambda f: len(f.get("m") or []))


def _load_level(level: int) -> list[dict]:
    path = DATA_DIR / f"{level}.min.json"
    raw = json.loads(path.read_text(encoding="utf-8"))
    out = []
    for entry in raw:
        hanzi = (entry.get("s") or "").strip()
        if not hanzi:
            continue
        form = _pick_form(entry.get("f") or [])
        pinyin = (form.get("i") or {}).get("y") or ""
        meanings = form.get("m") or []
        pos_list = entry.get("p") or []
        out.append({
            "hanzi": hanzi,
            "pinyin": pinyin.strip(),
            "meaning_en": "; ".join(m.strip() for m in meanings if m).strip(),
            "pos": "/".join(pos_list)[:16],
            "radical": (entry.get("r") or "").strip()[:32],
        })
    return out


def reconcile() -> dict:
    init_db()
    db = SessionLocal()
    stats = {"inserted": 0, "kept": 0, "moved": 0, "backfilled": 0, "resynced": 0, "collisions": 0}
    try:
        # Index existing rows by hanzi (first row wins as the "canonical" match)
        # and by (hanzi, level) for collision checks.
        existing_rows = db.scalars(select(Word)).all()
        by_hanzi: dict[str, Word] = {}
        by_key: dict[tuple[str, int], Word] = {}
        for w in existing_rows:
            by_key[(w.hanzi, w.hsk_level)] = w
            by_hanzi.setdefault(w.hanzi, w)

        for level in LEVELS:
            for item in _load_level(level):
                hanzi = item["hanzi"]
                key = (hanzi, level)
                target = by_key.get(key)

                if target is None:
                    # No row at the official level. Reuse a same-hanzi row from
                    # another level if one exists (preserves curated meaning_vi),
                    # otherwise insert fresh.
                    donor = by_hanzi.get(hanzi)
                    if donor is not None:
                        # Move donor to the official level.
                        old_level = donor.hsk_level
                        donor.hsk_level = level
                        by_key.pop((hanzi, old_level), None)
                        by_key[key] = donor
                        target = donor
                        stats["moved"] += 1
                    else:
                        new = Word(
                            hanzi=hanzi,
                            pinyin=item["pinyin"],
                            meaning_vi="",
                            meaning_en=item["meaning_en"],
                            hsk_level=level,
                            pos=item["pos"],
                            character_family=item["radical"],
                            source=OFFICIAL_SOURCE,
                            topic=f"hsk{level}",
                            frequency_band="core_hsk",
                        )
                        db.add(new)
                        db.flush()
                        by_key[key] = new
                        by_hanzi.setdefault(hanzi, new)
                        stats["inserted"] += 1
                        continue
                else:
                    stats["kept"] += 1

                # Backfill missing structured fields on the matched/moved row.
                changed = False
                if not (target.pinyin or "").strip() and item["pinyin"]:
                    target.pinyin = item["pinyin"]; changed = True
                if not (target.pos or "").strip() and item["pos"]:
                    target.pos = item["pos"]; changed = True
                if not (target.character_family or "").strip() and item["radical"]:
                    target.character_family = item["radical"]; changed = True
                if not (target.meaning_en or "").strip() and item["meaning_en"]:
                    target.meaning_en = item["meaning_en"]; changed = True

                # Sửa dữ liệu đã nhập sai từ chính chúng ta (source=hsk3-official):
                # form pinyin/nghĩa Anh có thể đã lấy nhầm danh từ riêng (车->"họ
                # Xa"). Ép đồng bộ lại theo form đã chọn đúng; nếu nghĩa Anh đổi,
                # xóa meaning_vi tự dịch để lần dịch sau sinh lại từ nguồn đúng.
                # KHÔNG đụng meaning_vi của từ curated (source != hsk3-official).
                if target.source == OFFICIAL_SOURCE:
                    if item["pinyin"] and target.pinyin != item["pinyin"]:
                        target.pinyin = item["pinyin"]; changed = True
                    if item["meaning_en"] and target.meaning_en != item["meaning_en"]:
                        target.meaning_en = item["meaning_en"]
                        target.meaning_vi = ""  # buộc dịch lại từ nghĩa Anh đúng
                        changed = True
                        stats["resynced"] += 1

                if changed:
                    stats["backfilled"] += 1

            db.commit()
    finally:
        db.close()
    return stats


def main() -> None:
    print("Reconciling DB against authoritative HSK 3.0 wordlist...")
    stats = reconcile()
    print(
        f"  inserted={stats['inserted']} moved={stats['moved']} "
        f"kept={stats['kept']} backfilled={stats['backfilled']} resynced={stats['resynced']}"
    )

    db = SessionLocal()
    try:
        print("Post-import counts by level:")
        for lvl in LEVELS:
            total = db.scalar(select(func.count()).select_from(Word).where(Word.hsk_level == lvl)) or 0
            pending = db.scalar(
                select(func.count()).select_from(Word).where(
                    Word.hsk_level == lvl,
                    (Word.meaning_vi == "") | (Word.meaning_vi.is_(None)),
                )
            ) or 0
            print(f"  HSK {lvl}: {total} words ({pending} pending translation)")
    finally:
        db.close()


if __name__ == "__main__":
    main()
