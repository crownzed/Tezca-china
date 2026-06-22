"""Slot-based template engine for generating diverse Chinese learning contexts.

Loads a JSON database of templates and slot dictionaries, then randomly
fills slots to produce unique paragraph and dialogue contexts for each word.
"""

from __future__ import annotations

import json
import random
from pathlib import Path

_TEMPLATES_PATH = Path(__file__).resolve().parents[1] / "data" / "slot_templates.json"


class TemplateEngine:
    """Stateless engine: loads templates once, renders on demand.

    Usage::

        engine = TemplateEngine()
        ctx = engine.render_paragraph(word_hanzi="学习", meaning="học tập",
                                       pinyin="xuéxí", example_cn="...", example_vi="...")
        # ctx["cn"], ctx["vi"]
    """

    def __init__(self, path: str | Path | None = None) -> None:
        raw = json.loads((Path(path) if path else _TEMPLATES_PATH).read_text(encoding="utf-8"))
        self._slots: dict[str, list[str]] = raw["slots"]
        self._paragraph_templates: list[dict[str, str]] = raw["paragraph_templates"]
        self._dialogue_templates: list[dict[str, str]] = raw["dialogue_templates"]
        self._slot_names: list[str] = list(self._slots.keys())

    # ---- public API ---------------------------------------------------------

    def render_paragraph(
        self,
        *,
        target_hanzi: str = "",
        meaning: str = "",
        pinyin: str = "",
        example_cn: str = "",
        example_vi: str = "",
        seed: int | None = None,
    ) -> dict[str, str]:
        """Return {cn, vi} for a filled paragraph template."""
        rng = random.Random(seed) if seed is not None else random
        template = rng.choice(self._paragraph_templates)
        return self._render(template, target_hanzi, meaning, pinyin, example_cn, example_vi, rng)

    def render_dialogue(
        self,
        *,
        target_hanzi: str = "",
        meaning: str = "",
        pinyin: str = "",
        example_cn: str = "",
        example_vi: str = "",
        seed: int | None = None,
    ) -> dict[str, str]:
        """Return {cn, vi, option_vi} for a filled dialogue template."""
        rng = random.Random(seed) if seed is not None else random
        template = rng.choice(self._dialogue_templates)
        return self._render(template, target_hanzi, meaning, pinyin, example_cn, example_vi, rng)

    # ---- internal -----------------------------------------------------------

    def _render(
        self,
        template: dict[str, str],
        target_hanzi: str,
        meaning: str,
        pinyin: str,
        example_cn: str,
        example_vi: str,
        rng: random.Random | random.Random = random,
    ) -> dict[str, str]:
        result: dict[str, str] = {}
        # Sample a fresh set of slot values for this render
        slot_values: dict[str, str] = {
            name: rng.choice(values) for name, values in self._slots.items()
        }
        # Word-specific values (these use {[FIELD]} syntax, NOT [FIELD])
        field_values: dict[str, str] = {
            "TARGET": target_hanzi,
            "MEANING": meaning,
            "TARGET_PINYIN": pinyin,
            "EXAMPLE_CN": example_cn,
            "EXAMPLE_VI": example_vi,
        }

        for key in ("cn", "vi", "option_vi"):
            text = template.get(key, "")
            if not text:
                continue
            # Replace [SLOT] placeholders (slot_values only — avoids substring
            # collision with {[FIELD]} syntax)
            text = self._fill_slots(text, slot_values)
            # Replace {[FIELD]} placeholders
            text = self._fill_fields(text, field_values)
            result[key] = text
        return result

    @staticmethod
    def _fill_slots(text: str, values: dict[str, str]) -> str:
        """Replace [SLOT_NAME] with sampled values."""
        for name, value in values.items():
            placeholder = f"[{name}]"
            if placeholder in text:
                text = text.replace(placeholder, value)
        return text

    @staticmethod
    def _fill_fields(text: str, values: dict[str, str]) -> str:
        """Replace {[FIELD_NAME]} with word-specific values."""
        for name, value in values.items():
            placeholder = f"{{[{name}]}}"
            if placeholder in text:
                text = text.replace(placeholder, value)
        return text


# Module-level singleton for easy import
_engine: TemplateEngine | None = None


def get_template_engine() -> TemplateEngine:
    global _engine
    if _engine is None:
        _engine = TemplateEngine()
    return _engine
