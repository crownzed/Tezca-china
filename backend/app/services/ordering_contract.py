"""Pure ordering-v1 contract. No database, provider or content repair side effects."""
from dataclasses import dataclass
import random
import unicodedata

ORDERING_VERSION = "ordering-v1"


class OrderingError(ValueError):
    pass


@dataclass(frozen=True)
class Ordering:
    segments: tuple[str, ...]
    correct_order: tuple[int, ...]
    scrambled_indices: tuple[int, ...]
    version: str = ORDERING_VERSION

    def as_metadata(self) -> dict:
        return {
            "ordering_version": self.version,
            "segments": list(self.segments),
            "correct_order": list(self.correct_order),
            "scrambled_indices": list(self.scrambled_indices),
        }


def _segments(value) -> tuple[str, ...]:
    if not isinstance(value, list) or len(value) < 2:
        raise OrderingError("ordering_segments")
    if any(not isinstance(token, str) or not any(
        unicodedata.category(char)[0] in "LN" for char in token
    ) for token in value):
        raise OrderingError("ordering_segments")
    if len(set(value)) < 2:
        raise OrderingError("ordering_unscramblable")
    return tuple(value)


def _permutation(value, size: int, code: str) -> tuple[int, ...]:
    if (not isinstance(value, list) or len(value) != size
            or any(type(index) is not int for index in value)
            or sorted(value) != list(range(size))):
        raise OrderingError(code)
    return tuple(value)


def _sentence(segments, order) -> str:
    return "".join(segments[index] for index in order)


def normalize_ordering(metadata) -> Ordering:
    if not isinstance(metadata, dict):
        raise OrderingError("ordering_metadata")
    if "ordering_version" in metadata and metadata["ordering_version"] != ORDERING_VERSION:
        raise OrderingError("ordering_version")
    if "accepted_orders" in metadata and metadata["accepted_orders"] != []:
        raise OrderingError("ordering_alternates_unsupported")
    segments = _segments(metadata.get("segments"))
    order = metadata.get("correct_order")
    if not isinstance(order, list) or len(order) != len(segments):
        raise OrderingError("ordering_correct_order")
    if all(type(index) is int for index in order):
        correct = _permutation(order, len(segments), "ordering_correct_order")
        scrambled = _permutation(metadata.get("scrambled_indices"), len(segments), "ordering_scramble")
    elif all(isinstance(token, str) for token in order):
        # Old rows store display strings in segments. Equal-valued strings have
        # no recoverable identity; never invent a greedy mapping for duplicates.
        if "ordering_version" in metadata:
            raise OrderingError("ordering_correct_order")
        if len(set(segments)) != len(segments) or len(set(order)) != len(order):
            raise OrderingError("ordering_legacy_ambiguous")
        if set(order) != set(segments):
            raise OrderingError("ordering_legacy_mismatch")
        if "scrambled_indices" in metadata:
            raise OrderingError("ordering_legacy_mixed")
        canonical = tuple(order)
        scrambled = tuple(canonical.index(token) for token in segments)
        segments = canonical
        correct = tuple(range(len(segments)))
    else:
        raise OrderingError("ordering_correct_order")
    if ("ordering_version" in metadata
            and _sentence(segments, correct) == _sentence(segments, scrambled)):
        raise OrderingError("ordering_visible_scramble")
    return Ordering(segments, correct, scrambled)


def grade_ordering(metadata, selected_order) -> bool:
    ordering = normalize_ordering(metadata)
    selected = _permutation(selected_order, len(ordering.segments), "ordering_selected_order")
    return selected == ordering.correct_order


def scramble_order(segments, correct_order, rng=None) -> list[int]:
    tokens = _segments(segments)
    correct = _permutation(correct_order, len(tokens), "ordering_correct_order")
    rng = rng or random.Random()
    scrambled = list(correct)
    rng.shuffle(scrambled)
    if _sentence(tokens, scrambled) != _sentence(tokens, correct):
        return scrambled
    # A deterministic fallback makes even an identity-producing RNG safe.
    for left in range(len(tokens)):
        for right in range(left + 1, len(tokens)):
            scrambled = list(correct)
            scrambled[left], scrambled[right] = scrambled[right], scrambled[left]
            if _sentence(tokens, scrambled) != _sentence(tokens, correct):
                return scrambled
    raise OrderingError("ordering_unscramblable")
