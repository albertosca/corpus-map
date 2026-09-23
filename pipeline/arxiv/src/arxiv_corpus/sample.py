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
    the sum above `n`, one item at a time is taken from the largest quota still above
    `floor` (ties broken by the smaller code) until the sum is `n` — always possible, because
    the check below guarantees `floor` per non-empty category already fits inside `n`. If
    that leaves the sum below `n` because caps held some categories down, the remainder is
    given one item at a time to the largest category not yet at its cap (ties the same way);
    if every category is already at its cap and the sum is still short, there simply is not
    enough material to reach `n`, and this raises `ValueError` naming the numbers.

    Raises `ValueError` up front, naming the numbers, if `floor` times the number of
    non-empty categories already exceeds `n` — there is no way to give everyone the floor.
    """
    non_empty = {code: total for code, total in totals.items() if total > 0}
    result: dict[str, int] = {code: 0 for code, total in totals.items() if total <= 0}

    floor_total = floor * len(non_empty)
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
    """Take `excess` items, one at a time, from the largest quota above `floor`."""
    for _ in range(excess):
        code = min(
            (c for c, q in quota.items() if q > floor),
            key=lambda c: (-quota[c], c),
        )
        quota[code] -= 1


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
