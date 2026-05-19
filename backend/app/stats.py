"""Statistical helpers for Tier 2 period-over-period comparisons.

Centralised here so significance math is unit-testable and consistent across
endpoints. Two tests are exposed:

* `two_prop_z` — for ratio metrics (engagement rate, save rate, conversion rate).
* `welchs_t` — for count metrics whose variance is unknown (impressions, reach).

`is_significant` applies a single 95% two-tailed threshold regardless of which
test produced the statistic so the caller can stay metric-agnostic.
"""

from __future__ import annotations

import math


def pct_delta(current: float | int, prior: float | int | None) -> float | None:
    """Percent change from `prior` to `current`.

    Returns None when `prior` is None (no comparison period available) **or**
    when `prior == 0` and `current != 0` (infinite delta — JSON has no
    representation for inf, so we surface None and let the FE render an em-dash).
    Returns 0.0 when both are 0.
    """
    if prior is None:
        return None
    if prior == 0:
        return 0.0 if current == 0 else None
    return ((current - prior) / prior) * 100.0


def two_prop_z(p1: float, n1: int, p2: float, n2: int) -> float:
    """Two-proportion z statistic for comparing rates (engagement rate, etc.).

    p1, p2 are proportions in [0, 1]. n1, n2 are the trial counts each
    proportion was computed from (typically reach or impressions).

    Requires n1, n2 >= 30 to be meaningful; smaller samples return 0.0.
    """
    if n1 < 30 or n2 < 30:
        return 0.0
    p_pool = (p1 * n1 + p2 * n2) / (n1 + n2)
    se = math.sqrt(p_pool * (1 - p_pool) * (1 / n1 + 1 / n2))
    if se == 0:
        return 0.0
    return (p1 - p2) / se


def welchs_t(
    mean_a: float, var_a: float, n_a: int,
    mean_b: float, var_b: float, n_b: int,
) -> float:
    """Welch's t statistic for comparing means with unequal variance.

    Returns 0.0 when either sample has < 3 observations.
    """
    if n_a < 3 or n_b < 3:
        return 0.0
    se_diff = math.sqrt(var_a / n_a + var_b / n_b)
    if se_diff == 0:
        return 0.0
    return (mean_a - mean_b) / se_diff


def is_significant(statistic: float) -> bool:
    """Return True if |statistic| exceeds the 95% two-tailed critical value."""
    return abs(statistic) >= 1.96


def _mean_var(samples: list[float]) -> tuple[float, float]:
    """Sample mean and (unbiased) variance. Returns (0, 0) when n < 2."""
    n = len(samples)
    if n < 2:
        return (samples[0] if samples else 0.0, 0.0)
    mean = sum(samples) / n
    var = sum((x - mean) ** 2 for x in samples) / (n - 1)
    return mean, var


def sample_significance(
    current_samples: list[float], prior_samples: list[float],
) -> bool | None:
    """Welch's t-test on two daily-sample lists.

    Returns None when either window has fewer than 3 daily samples (the
    minimum the underlying `welchs_t` function will treat as meaningful) so
    the FE shows nothing rather than a misleading "not sig" badge.
    Otherwise returns True/False from the 95% two-tailed test.
    """
    if len(current_samples) < 3 or len(prior_samples) < 3:
        return None
    m_a, v_a = _mean_var(current_samples)
    m_b, v_b = _mean_var(prior_samples)
    t = welchs_t(m_a, v_a, len(current_samples), m_b, v_b, len(prior_samples))
    if t == 0.0 and m_a == m_b:
        # Identical sums and variance — not a sample-size problem, just no
        # change to flag. Treat as not significant rather than "can't say".
        return False
    return is_significant(t)


def rate_significance(
    current_count: float | None,
    current_denom: float | None,
    prior_count: float | None,
    prior_denom: float | None,
) -> bool | None:
    """2-proportion z-test for rate metrics (e.g., save_rate = saves / reach).

    Returns None — meaning "can't say" — when any input is missing, when
    either denominator is non-positive, or when either sample is below the
    `two_prop_z` minimum-n threshold. Otherwise returns True / False from the
    95% two-tailed test.

    Callers wire this into `ComparisonValue.significant` for metrics where a
    natural denominator exists. For pure aggregate counts (views, reach,
    follows) we don't have per-period variance from a single sum, so those
    keep `significant=None` and the FE just omits the "sig." badge.
    """
    if (
        current_count is None
        or current_denom is None
        or prior_count is None
        or prior_denom is None
    ):
        return None
    if current_denom <= 0 or prior_denom <= 0:
        return None
    p1 = current_count / current_denom
    p2 = prior_count / prior_denom
    z = two_prop_z(p1, int(current_denom), p2, int(prior_denom))
    if z == 0.0:
        # two_prop_z returns 0 when n < 30 — distinct from "z is exactly 0"
        # (which means the two rates are identical). In either case the
        # answer is "not significant", but we surface None so the FE shows
        # nothing rather than a misleading "not sig" badge.
        return None
    return is_significant(z)
