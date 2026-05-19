export function pctDelta(current, prior) {
  if (prior == null || prior === 0) {
    return current === 0 ? 0 : null;
  }
  return ((current - prior) / prior) * 100;
}

export function unwrapComparison(raw) {
  if (raw && typeof raw === "object" && "current" in raw) {
    return {
      current: Number(raw.current ?? 0),
      prior: raw.prior == null ? null : Number(raw.prior),
      deltaPct: raw.delta_pct == null ? null : Number(raw.delta_pct),
      significant: raw.significant ?? null,
    };
  }
  const current = Number(raw ?? 0);
  return { current, prior: null, deltaPct: null, significant: null };
}

export function welchsTTest(meanA, varA, nA, meanB, varB, nB) {
  if (nA < 3 || nB < 3) return { significant: false, reason: "small_sample", t: 0 };
  const seDiff = Math.sqrt(varA / nA + varB / nB);
  if (seDiff === 0) return { significant: false, t: 0 };
  const t = Math.abs(meanA - meanB) / seDiff;
  return { significant: t > 2.0, t };
}
