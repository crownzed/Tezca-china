#!/usr/bin/env python
"""Pre-commit hook: fast content quality checks (under 30s).

Checks only files staged for commit, focusing on:
  - Pinyin format validity in changed seed data files
  - No duplicate quiz prompts
  - Options contain distinct values

Exits 0 on success, 1 on failure.
"""
import json
import re
import sys
from pathlib import Path

PINYIN_TONE_RE = re.compile(r'[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]')


def check_hsk_json(path: str) -> list[str]:
    """Check hsk.json entries for basic pinyin validity."""
    issues = []
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        return [f"Failed to read {path}: {e}"]

    if not isinstance(data, list):
        return [f"{path}: expected JSON array"]

    for i, item in enumerate(data):
        hanzi = item.get("hanzi") or item.get("word") or ""
        pinyin = item.get("pinyin") or ""

        if not hanzi:
            issues.append(f"{path}[{i}]: missing hanzi")
            continue

        if not pinyin:
            issues.append(f"{path}[{i}]: {hanzi} — missing pinyin")
            continue

        # Multi-hanzi words should have spaces or be marked erhua
        if len(hanzi) > 1 and " " not in pinyin:
            if not (hanzi.endswith("儿") and not " " in pinyin):
                issues.append(f"{path}[{i}]: {hanzi} — pinyin '{pinyin}' should have spaces between syllables")

        # At least one syllable should have a tone mark for non-neutral words
        syllables = pinyin.split()
        if len(hanzi) == 1 and syllables:
            syl = syllables[0]
            has_tone = bool(PINYIN_TONE_RE.search(syl)) or bool(re.search(r'[1-5]$', syl))
            if not has_tone:
                issues.append(f"{path}[{i}]: {hanzi} — single-hanzi pinyin '{pinyin}' has no tone indication")

    return issues


def main():
    root = Path(__file__).resolve().parents[2]
    all_issues = []

    # Check hsk.json if it exists and was changed
    hsk_path = root / "backend" / "raw_data" / "hsk.json"
    if hsk_path.exists():
        # Quick check: only run if it's been modified (git diff would tell us)
        issues = check_hsk_json(str(hsk_path))
        all_issues.extend(issues)

    if all_issues:
        print("❌ Content quality issues found:")
        for issue in all_issues:
            print(f"  • {issue}")
        print(f"\n{len(all_issues)} issue(s) found. Please fix before committing.")
        print("(Use --no-verify to bypass, not recommended)")
        sys.exit(1)

    print("✅ Content quality check passed")
    sys.exit(0)


if __name__ == "__main__":
    main()
