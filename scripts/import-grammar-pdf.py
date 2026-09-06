"""Import the 577 grammar entries from the supplied Vietnamese PDF.

The PDF is the source of truth.  This importer deliberately keeps the
extracted source text in every record, while also splitting the optional
meaning/usage/notes/examples sections for retrieval.  It does not infer an
individual HSK level because the PDF labels the collection (HSK 1-6), not
each entry.

Usage:
    python scripts/import-grammar-pdf.py \
      --input "C:\\Users\\Admin\\Downloads\\Full 500 Trang Ngữ pháp - HSK 1~6.pdf"
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import unicodedata
from pathlib import Path

import pdfplumber


EXPECTED_ITEMS = 577
EXPECTED_PAGES = 564
HEADING_RE = re.compile(r"^ng\u1eef\s+ph\u00e1p\s+(\d+)\.\s*(.*)$", re.IGNORECASE)
SECTION_RE = re.compile(r"^\d+\.\s*(.+)$")
PAGE_FOOTER_RE = re.compile(r"^(?:~\d+~|\d+)$")


def fold(value: str) -> str:
    """Lowercase and remove accents for stable section matching."""

    return "".join(
        char
        for char in unicodedata.normalize("NFD", value).lower()
        if unicodedata.category(char) != "Mn"
    )


def extract_pages(pdf_path: Path) -> list[list[str]]:
    pages: list[list[str]] = []
    with pdfplumber.open(pdf_path) as document:
        for page in document.pages:
            text = page.extract_text(x_tolerance=1, y_tolerance=3) or ""
            lines: list[str] = []
            for raw_line in text.splitlines():
                line = raw_line.strip()
                # These are the printed page counters, not grammar content.
                if not line or PAGE_FOOTER_RE.fullmatch(line):
                    continue
                lines.append(line)
            pages.append(lines)
    return pages


def split_sections(lines: list[str]) -> dict[str, str]:
    starts: list[tuple[int, str]] = []
    for index, line in enumerate(lines):
        match = SECTION_RE.match(line)
        if match:
            starts.append((index, fold(match.group(1)).rstrip(":").strip()))

    sections: dict[str, str] = {}
    for position, (start, label) in enumerate(starts):
        end = starts[position + 1][0] if position + 1 < len(starts) else len(lines)
        sections[label] = "\n".join(lines[start + 1 : end]).strip()
    return sections


def import_pdf(pdf_path: Path) -> dict:
    pages = extract_pages(pdf_path)
    if len(pages) != EXPECTED_PAGES:
        raise ValueError(f"Expected {EXPECTED_PAGES} pages, found {len(pages)}")

    items: list[dict] = []
    current: dict | None = None

    for page_number, lines in enumerate(pages, start=1):
        for line in lines:
            heading = HEADING_RE.match(line)
            if heading:
                if current is not None:
                    items.append(current)
                current = {
                    "number": int(heading.group(1)),
                    "header_lines": [line],
                    "lines": [line],
                    "page_start": page_number,
                    "body_started": False,
                }
                continue

            if current is None:
                continue

            # A few long titles wrap before "1. Ý nghĩa".  Join only those
            # continuation lines; numbered section labels remain body content.
            if not current["body_started"] and not SECTION_RE.match(line):
                current["header_lines"].append(line)
            else:
                current["body_started"] = True
            current["lines"].append(line)

    if current is not None:
        items.append(current)

    for index, item in enumerate(items):
        next_page = (
            items[index + 1]["page_start"] if index + 1 < len(items) else len(pages) + 1
        )
        item["page_end"] = max(item["page_start"], next_page - 1)

        first_heading = HEADING_RE.match(item["header_lines"][0])
        assert first_heading is not None
        item["title"] = " ".join(
            [first_heading.group(2).strip(), *item["header_lines"][1:]]
        ).strip()

        sections = split_sections(item["lines"])
        item["meaning"] = sections.get("y nghia", "")
        item["usage"] = sections.get("cach dung", "")
        item["notes"] = sections.get("luu y", "")
        # Early entries use "4. Ví dụ"; later entries use "3. Ví dụ".
        item["examples"] = sections.get("vi du", "")
        item["raw_text"] = "\n".join(item["lines"]).strip()
        item["id"] = f"grammar-pdf-{item['number']:03d}"

        item = {
            key: item[key]
            for key in (
                "id",
                "number",
                "title",
                "page_start",
                "page_end",
                "meaning",
                "usage",
                "notes",
                "examples",
                "raw_text",
            )
        }
        items[index] = item

    numbers = [item["number"] for item in items]
    expected_numbers = list(range(1, EXPECTED_ITEMS + 1))
    if numbers != expected_numbers:
        raise ValueError(
            "Grammar numbering is not exactly 1..577: "
            f"first mismatch near {next((i for i, pair in enumerate(zip(numbers, expected_numbers)) if pair[0] != pair[1]), '?')}"
        )
    for item in items:
        if not item["title"] or not item["raw_text"]:
            raise ValueError(f"Empty title/source text at entry {item['number']}")

    return {
        "schema_version": 1,
        "source": {
            "filename": pdf_path.name,
            "sha256": hashlib.sha256(pdf_path.read_bytes()).hexdigest(),
            "pages": len(pages),
            "item_count": len(items),
            "scope": "HSK 1-6 (the PDF does not label an individual HSK level for each entry)",
            "extraction": (
                "pdfplumber text extraction; standalone page footer numbers removed; "
                "source text retained in raw_text"
            ),
        },
        "items": items,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path, help="Source PDF path")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("backend/app/data/grammar_pool.json"),
        help="Output JSON path",
    )
    args = parser.parse_args()

    if not args.input.is_file():
        raise SystemExit(f"Input PDF not found: {args.input}")

    payload = import_pdf(args.input)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        f"✓ Imported {payload['source']['item_count']} grammar entries "
        f"from {payload['source']['pages']} pages → {args.output}"
    )
    print(f"  PDF SHA-256: {payload['source']['sha256']}")


if __name__ == "__main__":
    main()
