"""Per-category sampling quotas: a floor per category, an exact total.

`quotas` turns a `{category: available papers}` map into a `{category: how many to fetch}`
map that sums to exactly `n`, giving every non-empty category at least `floor` (capped at
its own total) while keeping the rest proportional to each category's share of the whole.
"""

from __future__ import annotations


def quotas(totals: dict[str, int], n: int, floor: int = 20) -> dict[str, int]:
    """Allocate `n` items across `totals`' categories, deterministically.

    Rules: a category with `total == 0` gets `0`. Every other ("non-empty") category gets
    `max(floor, round(n * total / sum(totals)))`, capped at its own `total`. If that leaves
    the sum above `n`, the excess is spread proportionally across every quota still above
    `floor` (by how far above `floor` each one currently is, not always taken entirely from
    whichever is largest) until the sum is `n` — always possible, because the check below
    guarantees floor (or a category's own total, if that is smaller) per non-empty category
    already fits inside `n`. If that leaves the sum below `n` because caps held some
    categories down, the remainder is given one item at a time to the largest category not
    yet at its cap (ties broken by the smaller code); if every category is already at its
    cap and the sum is still short, there simply is not enough material to reach `n`, and
    this raises `ValueError` naming the numbers.

    Raises `ValueError` up front, naming the numbers, if `floor` (or a category's own total,
    for a category whose total is below `floor`) summed across non-empty categories already
    exceeds `n` — there is no way to give everyone at least what they need.
    """
    non_empty = {code: total for code, total in totals.items() if total > 0}
    result: dict[str, int] = {code: 0 for code, total in totals.items() if total <= 0}

    floor_total = sum(min(floor, total) for total in non_empty.values())
    if floor_total > n:
        raise ValueError(
            f"floor {floor} across {len(non_empty)} non-empty categories requires {floor_total}, which exceeds n={n}"
        )

    grand_total = sum(totals.values())
    quota = {code: min(total, max(floor, round(n * total / grand_total))) for code, total in non_empty.items()}
    current = sum(quota.values())

    if current > n:
        _shrink(quota, current - n, floor)
    elif current < n:
        _grow(quota, non_empty, n - current, n)

    result.update(quota)
    return result


def _shrink(quota: dict[str, int], excess: int, floor: int) -> None:
    """Take `excess` items in total, spread across every quota above `floor` in proportion
    to how far above `floor` it currently is -- the largest-remainder method, so the result
    sums exactly and no single category absorbs the whole excess just for being largest.
    """
    eligible = [code for code, q in quota.items() if q > floor]
    headroom = {code: quota[code] - floor for code in eligible}
    headroom_total = sum(headroom.values())

    exact = {code: excess * headroom[code] / headroom_total for code in eligible}
    cuts = {code: int(exact[code]) for code in eligible}
    remainder = excess - sum(cuts.values())

    # The `remainder` units still owed go to the categories with the largest fractional
    # share first (ties broken by ascending code) -- the standard largest-remainder method.
    # `remainder` equals the sum of `len(eligible)` fractional parts (each in [0, 1)), so it
    # is always strictly less than `len(eligible)` -- this slice never runs past the list.
    order = sorted(eligible, key=lambda c: (-(exact[c] - cuts[c]), c))
    for code in order[:remainder]:
        cuts[code] += 1

    for code, cut in cuts.items():
        quota[code] -= cut


def _grow(quota: dict[str, int], totals: dict[str, int], remaining: int, n: int) -> None:
    """Give `remaining` items, one at a time, to the largest category still below its cap."""
    for _ in range(remaining):
        candidates = [code for code in quota if quota[code] < totals[code]]
        if not candidates:
            short = n - sum(quota.values())
            raise ValueError(
                f"cannot allocate n={n}: total available across non-empty categories is "
                f"{sum(totals.values())}, short by {short}"
            )
        code = min(candidates, key=lambda c: (-quota[c], c))
        quota[code] += 1
