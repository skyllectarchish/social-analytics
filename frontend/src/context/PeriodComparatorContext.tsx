import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

// Comparison modes mirror the backend's COMPARE_TO_PATTERN grammar
// (backend/app/repositories/comparison.py): four named presets plus a custom
// "YYYY-MM-DD,YYYY-MM-DD" range. "off" disables comparison entirely.
export type CompareMode =
  | "off"
  | "prev_period"
  | "prev_year"
  | "mtd_vs_last_mtd"
  | "ytd_vs_last_ytd"
  | "custom";

export const COMPARE_OPTIONS: { value: CompareMode; label: string }[] = [
  { value: "off", label: "No compare" },
  { value: "prev_period", label: "vs prev period" },
  { value: "prev_year", label: "vs prev year" },
  { value: "mtd_vs_last_mtd", label: "MTD vs last" },
  { value: "ytd_vs_last_ytd", label: "YTD vs last" },
  { value: "custom", label: "Custom range" },
];

type CustomRange = { from: string; to: string };

type PeriodComparatorValue = {
  compareMode: CompareMode;
  setCompareMode: (m: CompareMode) => void;
  customRange: CustomRange;
  setCustomRange: (r: CustomRange) => void;
  // Value for the API's `compare_to` query param (null = no comparison).
  compareTo: string | null;
  // MTD/YTD override the days window server-side; the days selector should
  // appear disabled while one is active.
  calendarPreset: boolean;
};

const PeriodComparatorContext = createContext<PeriodComparatorValue | null>(null);

export function PeriodComparatorProvider({ children }: { children: ReactNode }) {
  const [compareMode, setCompareMode] = useState<CompareMode>("off");
  const [customRange, setCustomRange] = useState<CustomRange>({ from: "", to: "" });

  const value = useMemo<PeriodComparatorValue>(() => {
    let compareTo: string | null = null;
    if (compareMode === "custom") {
      compareTo = customRange.from && customRange.to ? `${customRange.from},${customRange.to}` : null;
    } else if (compareMode !== "off") {
      compareTo = compareMode;
    }
    return {
      compareMode,
      setCompareMode,
      customRange,
      setCustomRange,
      compareTo,
      calendarPreset: compareMode === "mtd_vs_last_mtd" || compareMode === "ytd_vs_last_ytd",
    };
  }, [compareMode, customRange]);

  return <PeriodComparatorContext.Provider value={value}>{children}</PeriodComparatorContext.Provider>;
}

export function usePeriodComparator(): PeriodComparatorValue {
  const ctx = useContext(PeriodComparatorContext);
  if (!ctx) throw new Error("usePeriodComparator must be used inside PeriodComparatorProvider");
  return ctx;
}
