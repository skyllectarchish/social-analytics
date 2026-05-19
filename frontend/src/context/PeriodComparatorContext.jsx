import { createContext, useContext, useMemo, useState } from "react";

const Ctx = createContext(null);

export function PeriodComparatorProvider({ children, defaultDays = 30 }) {
  const [days, setDays] = useState(defaultDays);
  const [compareMode, setCompareMode] = useState(null);
  const [customRange, setCustomRange] = useState(null);

  const compareTo = useMemo(() => {
    if (compareMode === null) return null;
    if (
      compareMode === "prev_period" ||
      compareMode === "prev_year" ||
      compareMode === "mtd_vs_last_mtd" ||
      compareMode === "ytd_vs_last_ytd"
    ) return compareMode;
    if (compareMode === "custom" && customRange?.from && customRange?.to) {
      return `${customRange.from},${customRange.to}`;
    }
    return null;
  }, [compareMode, customRange]);

  const value = useMemo(
    () => ({
      days,
      setDays,
      compareMode,
      setCompareMode,
      customRange,
      setCustomRange,
      compareTo,
    }),
    [days, compareMode, customRange, compareTo],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const NOOP_CTX = {
  days: 30,
  setDays: () => {},
  compareMode: null,
  setCompareMode: () => {},
  customRange: null,
  setCustomRange: () => {},
  compareTo: null,
};

export function usePeriodComparator() {
  const ctx = useContext(Ctx);
  return ctx ?? NOOP_CTX;
}
