"""The browser and server consume the same offline ordering fixtures."""
from copy import deepcopy
import json
from pathlib import Path
import random

import pytest

from app.services.ordering_contract import OrderingError, grade_ordering, normalize_ordering, scramble_order

FIXTURES = json.loads((Path(__file__).resolve().parents[2] / "tests/fixtures/ordering-v1.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", FIXTURES["cases"], ids=lambda case: case["name"])
def test_shared_ordering_contract(case):
    metadata = deepcopy(case.get("metadata", {**FIXTURES["base"], **case.get("patch", {})}))
    for key in case.get("omit", []):
        metadata.pop(key, None)
    before = deepcopy(metadata)
    if "error" in case:
        with pytest.raises(OrderingError, match=f"^{case['error']}$"):
            normalize_ordering(metadata)
    else:
        ordering = normalize_ordering(metadata)
        if "normalized" in case:
            assert ordering.as_metadata() == case["normalized"]
        elif all(type(index) is int for index in metadata["correct_order"]):
            assert list(ordering.correct_order) == metadata["correct_order"]
        for answer in case.get("answers", []):
            if "error" in answer:
                with pytest.raises(OrderingError, match=f"^{answer['error']}$"):
                    grade_ordering(metadata, answer["selected"])
            else:
                assert grade_ordering(metadata, answer["selected"]) is answer["correct"]
    assert metadata == before


@pytest.mark.parametrize("case", FIXTURES["cases"], ids=lambda case: case["name"])
def test_qa_uses_the_same_metadata_contract(case):
    from app.services.question_quality import drag_contract_errors

    metadata = deepcopy(case.get("metadata", {**FIXTURES["base"], **case.get("patch", {})}))
    for key in case.get("omit", []):
        metadata.pop(key, None)
    before = deepcopy(metadata)
    assert bool(drag_contract_errors(metadata)) == ("error" in case)
    assert metadata == before


class IdentityRng:
    def shuffle(self, values):
        pass


@pytest.mark.parametrize("segments,correct", [
    (["我", "是", "学生。"], [0, 1, 2]),
    (["想", "想", "办法。"], [0, 1, 2]),
    (["是", "我", "学生。"], [1, 0, 2]),
])
def test_scramble_is_visibly_different_even_with_identity_rng(segments, correct):
    for rng in [IdentityRng(), *(random.Random(seed) for seed in range(30))]:
        scrambled = scramble_order(segments, correct, rng)
        assert sorted(scrambled) == list(range(len(segments)))
        assert "".join(segments[i] for i in scrambled) != "".join(segments[i] for i in correct)


def test_unrenderable_scramble_is_rejected():
    with pytest.raises(OrderingError, match="^ordering_unscramblable$"):
        scramble_order(["哈", "哈哈"], [0, 1], IdentityRng())
