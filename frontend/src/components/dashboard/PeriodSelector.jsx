const PERIODS = [
  { label: "7d", value: 7 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
];

export default function PeriodSelector({ days, onChange }) {
  return (
    <div className="chip-soft flex items-center gap-1 rounded-xl p-1">
      {PERIODS.map((p) => (
        <button
          key={p.value}
          onClick={() => onChange(p.value)}
          className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
            days === p.value
              ? "bg-white text-violet-700 shadow-sm"
              : "text-slate-500 hover:text-[#0a0e27]"
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
