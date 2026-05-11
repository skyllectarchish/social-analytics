import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const COLOR_MAP = { M: "#7C3AED", F: "#EC4899", U: "#475569" };
const LABEL_MAP = { M: "Male", F: "Female", U: "Other" };

function DarkTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.98)",
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 12,
        padding: "10px 14px",
        backdropFilter: "blur(20px)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.10)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: d.payload.fill }} />
        <span style={{ color: "#64748B", fontSize: 12 }}>{d.name}</span>
        <span style={{ color: "#0F172A", fontSize: 13, fontWeight: 700, marginLeft: 8 }}>
          {d.value.toLocaleString()} ({(d.payload.percent * 100).toFixed(1)}%)
        </span>
      </div>
    </div>
  );
}

function CustomLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }) {
  if (percent < 0.06) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

export default function GenderDonut({ data }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const pieData = data.map((d) => ({
    name: LABEL_MAP[d.dimension_value?.toUpperCase()] ?? d.dimension_value,
    value: d.value,
    key: d.dimension_value?.toUpperCase() ?? "U",
    fill: COLOR_MAP[d.dimension_value?.toUpperCase()] ?? "#64748b",
    percent: d.value / total,
  }));

  return (
    <div>
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie
            data={pieData}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={75}
            paddingAngle={3}
            dataKey="value"
            labelLine={false}
            label={CustomLabel}
            animationBegin={100}
            animationDuration={800}
          >
            {pieData.map((entry) => (
              <Cell key={entry.key} fill={entry.fill} stroke="none" />
            ))}
          </Pie>
          <Tooltip content={<DarkTooltip />} />
        </PieChart>
      </ResponsiveContainer>

      <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 4 }}>
        {pieData.map((d) => (
          <div key={d.key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: d.fill }} />
            <span style={{ fontSize: 11, color: "#475569" }}>{d.name}</span>
            <span style={{ fontSize: 11, color: "#64748B", fontWeight: 600 }}>
              {(d.percent * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
