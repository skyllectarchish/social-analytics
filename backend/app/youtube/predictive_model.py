"""Linear regression model for 30-day view prediction.

Input features: 4-hour view count, 4-hour average watch time (seconds), CTR %.
Target: 30-day view count.
"""

import logging

import numpy as np
from sklearn.linear_model import LinearRegression

logger = logging.getLogger(__name__)

_MIN_SAMPLES = 5
_FALLBACK_MULTIPLIER = 180  # rough 4h-to-30d multiplier when no model trained


def train_model(samples: list[dict]) -> dict:
    """Train on historical velocity samples.

    Each sample: {four_hour_views, four_hour_avg_watch_s, ctr_pct, final_views}
    Returns serializable state dict or {} if too few samples.
    """
    if len(samples) < _MIN_SAMPLES:
        return {}
    X = np.array([[s["four_hour_views"], s["four_hour_avg_watch_s"], s["ctr_pct"]]
                  for s in samples], dtype=float)
    y = np.array([s["final_views"] for s in samples], dtype=float)
    model = LinearRegression()
    model.fit(X, y)
    r2 = float(model.score(X, y))
    return {
        "coefficients": model.coef_.tolist(),
        "intercept": float(model.intercept_),
        "r2_score": r2,
        "sample_size": len(samples),
    }


def predict(model_state: dict, four_hour_views: int, avg_watch_s: float, ctr_pct: float) -> tuple[int, int, int]:
    """Returns (predicted, low, high) view counts.

    Falls back to multiplier if model_state is empty or missing keys.
    """
    if not model_state or "coefficients" not in model_state:
        predicted = int(four_hour_views * _FALLBACK_MULTIPLIER)
    else:
        coef = model_state["coefficients"]
        intercept = model_state["intercept"]
        raw = intercept + coef[0] * four_hour_views + coef[1] * avg_watch_s + coef[2] * ctr_pct
        predicted = max(0, int(raw))

    r2 = model_state.get("r2_score", 0.0) if model_state else 0.0
    margin_pct = 0.50 if r2 < 0.5 else 0.25
    margin = max(int(predicted * margin_pct), 100)
    low = max(0, predicted - margin)
    high = predicted + margin
    return predicted, low, high
