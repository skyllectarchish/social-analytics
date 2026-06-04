// Small numeric helpers shared by the comparison UI.

// Percentage change current vs prior; null when prior is missing/zero so the
// UI can hide the delta instead of rendering Infinity/NaN.
export function pctDelta(current: number, prior: number | null | undefined): number | null {
  if (prior == null || prior === 0) return null;
  return ((current - prior) / Math.abs(prior)) * 100;
}

// Average of a selector over a list — convenience for prior-window KPI math.
export function avgOf<T>(items: T[], sel: (t: T) => number): number {
  if (!items.length) return 0;
  return items.reduce((s, t) => s + sel(t), 0) / items.length;
}

export function sumOf<T>(items: T[], sel: (t: T) => number): number {
  return items.reduce((s, t) => s + sel(t), 0);
}
