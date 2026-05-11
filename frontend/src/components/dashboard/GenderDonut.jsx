const GENDER_COLORS = {
  M: { fill: "#8b5cf6", label: "Male" },
  F: { fill: "#ec4899", label: "Female" },
  U: { fill: "#94a3b8", label: "Other" },
};

const R = 45;
const CX = 70;
const CY = 70;
const CIRCUMFERENCE = 2 * Math.PI * R;
const STROKE_WIDTH = 20;

export default function GenderDonut({ data }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    return (
      <div className="py-8 text-center text-sm text-slate-400">No gender data.</div>
    );
  }

  let offset = 0;
  const segments = data.map((d) => {
    const key = d.dimension_value?.toUpperCase() || "U";
    const color = GENDER_COLORS[key] ?? GENDER_COLORS.U;
    const arc = (d.value / total) * CIRCUMFERENCE;
    const seg = { ...color, arc, offset, pct: ((d.value / total) * 100).toFixed(1) };
    offset += arc;
    return seg;
  });

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <svg width={CX * 2} height={CY * 2} viewBox={`0 0 ${CX * 2} ${CY * 2}`}>
        {segments.map((s, i) => (
          <circle
            key={i}
            cx={CX}
            cy={CY}
            r={R}
            fill="none"
            stroke={s.fill}
            strokeWidth={STROKE_WIDTH}
            strokeDasharray={`${s.arc.toFixed(2)} ${(CIRCUMFERENCE - s.arc).toFixed(2)}`}
            strokeDashoffset={(-s.offset + CIRCUMFERENCE / 4).toFixed(2)}
            strokeLinecap="butt"
          />
        ))}
        <text
          x={CX}
          y={CY - 6}
          textAnchor="middle"
          style={{ fontSize: 13, fontWeight: 700, fill: "#0a0e27", fontFamily: "system-ui" }}
        >
          {total.toLocaleString()}
        </text>
        <text
          x={CX}
          y={CY + 10}
          textAnchor="middle"
          style={{ fontSize: 9, fill: "#94a3b8", fontFamily: "system-ui" }}
        >
          total
        </text>
      </svg>

      <div className="flex flex-wrap justify-center gap-3">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: s.fill }} />
            {s.label} <span className="text-slate-400">{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
