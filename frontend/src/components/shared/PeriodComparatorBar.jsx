import { motion } from "framer-motion";
import { GitCompare } from "lucide-react";
import { usePeriodComparator } from "../../context/PeriodComparatorContext";

const DAY_OPTS = [
  { value: 7, label: "7d" },
  { value: 30, label: "30d" },
  { value: 90, label: "90d" },
  { value: 365, label: "1y" },
];

const COMPARE_OPTS = [
  { value: null, label: "Off" },
  { value: "prev_period", label: "Prev period" },
  { value: "prev_year", label: "Y/Y" },
  { value: "mtd_vs_last_mtd", label: "MTD" },
  { value: "ytd_vs_last_ytd", label: "YTD" },
];

//: Calendar-aligned comparisons override the caller's `days` because the
//: whole point is the calendar-aligned window. The `days` chip group is
//: disabled while one of these is selected so the UI doesn't suggest the
//: lookback still matters.
const CALENDAR_PRESETS = new Set(["mtd_vs_last_mtd", "ytd_vs_last_ytd"]);

function ChipGroup({ options, selected, onChange, layoutId, disabled = false }) {
  return (
    <div
      className="flex items-center gap-0.5 rounded-xl p-1"
      style={{
        background: "rgba(0,0,0,0.05)",
        border: "1px solid rgba(0,0,0,0.07)",
        opacity: disabled ? 0.45 : 1,
        pointerEvents: disabled ? "none" : "auto",
      }}
    >
      {options.map((opt) => {
        const isActive = selected === opt.value;
        return (
          <button
            key={opt.label}
            onClick={() => onChange(opt.value)}
            disabled={disabled}
            className="relative px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{
              color: isActive ? "#0F172A" : "#94A3B8",
              border: "none",
              background: "transparent",
              cursor: disabled ? "not-allowed" : "pointer",
              transition: "color 0.15s",
              zIndex: 1,
            }}
          >
            {isActive && (
              <motion.div
                layoutId={layoutId}
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: 8,
                  background: "#FFFFFF",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.04)",
                  zIndex: -1,
                }}
                transition={{ type: "spring", damping: 24, stiffness: 340 }}
              />
            )}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export default function PeriodComparatorBar() {
  const { days, setDays, compareMode, setCompareMode } = usePeriodComparator();
  const calendarMode = CALENDAR_PRESETS.has(compareMode);

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <ChipGroup
        options={DAY_OPTS}
        selected={days}
        onChange={setDays}
        layoutId="period-pill"
        disabled={calendarMode}
      />
      <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
        <GitCompare size={12} />
        <span className="hidden sm:inline">Compare</span>
      </div>
      <ChipGroup
        options={COMPARE_OPTS}
        selected={compareMode}
        onChange={setCompareMode}
        layoutId="compare-pill"
      />
    </div>
  );
}
