from __future__ import annotations

import random

import pytest

from arxiv_corpus.sample import quotas


def test_quotas_proportional_case_sums_to_n() -> None:
    result = quotas({"cs.A": 2000, "cs.B": 8000}, n=1000, floor=20)

    assert result == {"cs.A": 200, "cs.B": 800}
    assert sum(result.values()) == 1000


def test_quotas_floor_is_respected_for_small_categories() -> None:
    result = quotas({"cs.A": 9000, "cs.B": 20, "cs.C": 20}, n=1000, floor=20)

    assert result["cs.B"] == 20
    assert result["cs.C"] == 20
    assert sum(result.values()) == 1000


def test_quotas_zero_total_category_gets_zero() -> None:
    result = quotas({"cs.A": 10000, "cs.EMPTY": 0}, n=1000, floor=20)

    assert result["cs.EMPTY"] == 0
    assert sum(result.values()) == 1000


def test_quotas_category_with_total_five_gets_at_most_five() -> None:
    result = quotas({"cs.A": 10000, "cs.TINY": 5}, n=1000, floor=20)

    assert result["cs.TINY"] == 5
    assert sum(result.values()) == 1000


def test_quotas_grows_uncapped_categories_when_caps_leave_a_remainder() -> None:
    result = quotas({"cs.A": 3000, "cs.B": 3000, "cs.C": 3000}, n=1000, floor=20)

    assert result == {"cs.A": 334, "cs.B": 333, "cs.C": 333}
    assert sum(result.values()) == 1000


def test_quotas_floor_overflow_raises_naming_the_numbers() -> None:
    with pytest.raises(ValueError, match=r"20 across 3 non-empty categories requires 60.*exceeds n=10"):
        quotas({"cs.A": 100, "cs.B": 100, "cs.C": 100}, n=10, floor=20)


def test_quotas_insufficient_total_capacity_raises_naming_the_numbers() -> None:
    with pytest.raises(ValueError, match=r"n=5000.*total available.*200"):
        quotas({"cs.A": 100, "cs.B": 100}, n=5000, floor=20)


def test_quotas_is_deterministic_regardless_of_dict_insertion_order() -> None:
    forward = quotas({"cs.A": 9000, "cs.B": 50, "cs.C": 50}, n=1000, floor=20)
    reversed_ = quotas({"cs.C": 50, "cs.B": 50, "cs.A": 9000}, n=1000, floor=20)

    assert forward == reversed_


def test_quotas_shrink_ties_break_by_ascending_code() -> None:
    """Two equal-share categories above the floor: shrink alternates, breaking ties on code."""
    result = quotas({"cs.A": 1000, "cs.B": 1000, "cs.C": 20}, n=999, floor=20)

    assert result == {"cs.A": 489, "cs.B": 490, "cs.C": 20}
    assert sum(result.values()) == 999


def test_quotas_property_sum_is_exact_or_raises() -> None:
    """200 random totals maps: `quotas` either sums to exactly `n` or raises `ValueError`,
    never returns a partial or over-cap allocation.
    """
    rng = random.Random(7)
    floor = 20
    raised = 0
    resolved = 0

    for i in range(200):
        category_count = rng.randint(1, 15)
        totals = {f"cs.{j:02d}": rng.choice([0, rng.randint(1, 5000)]) for j in range(category_count)}
        n = rng.randint(0, 20000)

        try:
            result = quotas(totals, n, floor=floor)
        except ValueError:
            raised += 1
            continue

        resolved += 1
        assert sum(result.values()) == n, (i, totals, n, result)
        for code, total in totals.items():
            assert result[code] <= total, (i, totals, n, result)
            if total > 0:
                assert result[code] >= min(floor, total), (i, totals, n, result)

    assert raised > 0
    assert resolved > 0
