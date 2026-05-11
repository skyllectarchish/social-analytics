import { motion } from "framer-motion";

const PERIODS = [
  { label: "7d", value: 7 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
];

export default function PeriodSelector({ days, onChange }) {
  return (
    <div
      className="flex items-center gap-0.5 rounded-xl p-1"
      style={{
        background: "rgba(0,0,0,0.05)",
        border: "1px solid rgba(0,0,0,0.07)",
      }}
    >
      {PERIODS.map((p) => (
        <button
          key={p.value}
          onClick={() => onChange(p.value)}
          className="relative px-3 py-1.5 rounded-lg text-xs font-semibold"
          style={{
            color: days === p.value ? "#0F172A" : "#94A3B8",
            border: "none",
            background: "transparent",
            cursor: "pointer",
            transition: "color 0.15s",
            zIndex: 1,
          }}
        >
          {days === p.value && (
            <motion.div
              layoutId="period-pill"
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
          {p.label}
        </button>
      ))}
    </div>
  );
}
