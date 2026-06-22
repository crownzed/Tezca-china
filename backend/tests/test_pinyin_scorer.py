"""Tests for PinyinScorer service."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.services.pinyin_scorer import score_pinyin


def test_perfect_match():
    result = score_pinyin("nǐ hǎo", "nǐ hǎo")
    assert result["score"] == 100
    assert result["base_score"] == 100
    assert len(result["tone_errors"]) == 0
    assert len(result["syllable_errors"]) == 0


def test_wrong_tone():
    result = score_pinyin("nǐ hǎo", "ní hǎo")
    assert result["score"] < 100
    assert result["base_score"] == 100  # base syllables correct
    assert len(result["tone_errors"]) == 1
    assert result["tone_errors"][0]["pos"] == 0
    assert result["tone_errors"][0]["expected_tone"] == 3
    assert result["tone_errors"][0]["got_tone"] == 2


def test_wrong_syllable():
    result = score_pinyin("nǐ hǎo", "nǐ hài")
    assert result["base_score"] < 100
    assert len(result["syllable_errors"]) == 1
    assert result["syllable_errors"][0]["type"] == "wrong_syllable"


def test_missing_syllable():
    result = score_pinyin("nǐ hǎo", "nǐ")
    assert result["score"] < 100
    assert result["syllable_errors"][0]["type"] == "missing"


def test_extra_syllable():
    result = score_pinyin("nǐ", "nǐ hǎo")
    assert result["score"] < 100
    assert result["syllable_errors"][0]["type"] == "extra"


def test_empty_input():
    result = score_pinyin("nǐ hǎo", "")
    assert result["score"] == 0
    assert len(result["syllable_errors"]) == 1


def test_neutral_tone_not_penalized():
    # Neutral tone in actual should not be penalized
    result = score_pinyin("xué xiào", "xué xiào")
    assert result["score"] == 100


def test_case_insensitive():
    result = score_pinyin("Zhōng guó", "zhōng guó")
    assert result["base_score"] == 100


def test_spacing_variation():
    result = score_pinyin("nǐ  hǎo", "nǐ hǎo")
    assert result["score"] == 100


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
