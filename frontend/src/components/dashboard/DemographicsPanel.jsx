import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useDemographics } from "../../hooks/useInsights";
import GenderDonut from "./GenderDonut";

const BREAKDOWNS = ["age", "gender", "city", "country"];

const BAR_GRADIENTS = [
  ["#7C3AED", "#6D28D9"],
  ["#06B6D4", "#0891B2"],
  ["#EC4899", "#DB2777"],
  ["#10B981", "#059669"],
  ["#F97316", "#EA580C"],
  ["#8B5CF6", "#7C3AED"],
  ["#14B8A6", "#0D9488"],
  ["#F43F5E", "#E11D48"],
];

function GlassTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.98)",
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 12,
        padding: "10px 14px",
        backdropFilter: "blur(24px)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.10)",
      }}
    >
      <p style={{ color: "#94A3B8", fontSize: 10, fontWeight: 700, marginBottom: 8, letterSpacing: "0.10em", textTransform: "uppercase" }}>
        {label}
      </p>
      {payload.map((p) => (
        <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.fill, boxShadow: `0 0 6px ${p.fill}88` }} />
          <span style={{ color: "#64748B", fontSize: 12, flex: 1 }}>Count</span>
          <span className="metric-value" style={{ color: "#0F172A", fontSize: 13 }}>
            {p.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

function SkeletonBars() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 4 }}>
      {[70, 50, 85, 40, 60, 35].map((w, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 44, height: 10, borderRadius: 4, background: "rgba(0,0,0,0.06)" }} />
          <div style={{ height: 10, width: `${w}%`, borderRadius: 4, background: "rgba(0,0,0,0.06)" }} />
        </div>
      ))}
    </div>
  );
}

export default function DemographicsPanel() {
  const [breakdown, setBreakdown] = useState("age");
  const [metric, setMetric] = useState("follower_demographics");

  const { data, loading, error } = useDemographics(metric, breakdown);

  const chartData = useMemo(
    () =>
      [...(data?.data ?? [])]
        .sort((a, b) => b.value - a.value)
        .slice(0, 8)
        .map((d) => ({ name: d.dimension_value ?? "", value: d.value })),
    [data],
  );

  return (
    <div
      className="rounded-2xl p-5 d-card"
      style={{ height: "100%" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#94A3B8" }}>
          Audience Demographics
        </p>

        {/* Metric toggle */}
        <div
          style={{
            display: "flex",
            gap: 2,
            background: "rgba(0,0,0,0.04)",
            border: "1px solid rgba(0,0,0,0.07)",
            borderRadius: 8,
            padding: 2,
          }}
        >
          {[
            { val: "follower_demographics", label: "Followers" },
            { val: "engaged_audience_demographics", label: "Engaged" },
          ].map((m) => (
            <button
              key={m.val}
              onClick={() => setMetric(m.val)}
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: "4px 10px",
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
                transition: "all 0.15s",
                background: metric === m.val ? "rgba(124,58,237,0.12)" : "transparent",
                color: metric === m.val ? "#7C3AED" : "#64748B",
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Animated breakdown tabs */}
      <div style={{ position: "relative", display: "flex", gap: 4, marginBottom: 18, background: "rgba(0,0,0,0.05)", borderRadius: 10, padding: 3 }}>
        {BREAKDOWNS.map((b) => (
          <button
            key={b}
            onClick={() => setBreakdown(b)}
            style={{
              flex: 1,
              padding: "5px 0",
              borderRadius: 7,
              fontSize: 11,
              fontWeight: 600,
              textTransform: "capitalize",
              cursor: "pointer",
              border: "none",
              background: "transparent",
              color: breakdown === b ? "#fff" : "#64748B",
              position: "relative",
              zIndex: 1,
              transition: "color 0.2s",
            }}
          >
            {breakdown === b && (
              <motion.div
                layoutId="breakdown-pill"
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: 7,
                  background: "linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)",
                  zIndex: -1,
                }}
                transition={{ type: "spring", damping: 22, stiffness: 320 }}
              />
            )}
            {b}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <SkeletonBars />
      ) : error || !data?.data?.length ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: 200,
            fontSize: 13,
            color: "#94A3B8",
          }}
        >
          {error || "No data — run a sync first."}
        </div>
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${breakdown}-${metric}`}
            initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
            transition={{ type: "spring", duration: 0.38, bounce: 0 }}
          >
            {breakdown === "gender" ? (
              <GenderDonut data={data.data} />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
                >
                  <defs>
                    {BAR_GRADIENTS.map(([start, end], i) => (
                      <linearGradient key={i} id={`barGrad${i}`} x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor={start} stopOpacity={0.9} />
                        <stop offset="100%" stopColor={end} stopOpacity={0.7} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 8" stroke="rgba(0,0,0,0.05)" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: "#94A3B8", fontSize: 10, fontFamily: "system-ui" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fill: "#94A3B8", fontSize: 11, fontFamily: "system-ui" }}
                    axisLine={false}
                    tickLine={false}
                    width={60}
                  />
                  <Tooltip content={<GlassTooltip />} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={14} animationDuration={800}>
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={`url(#barGrad${i % BAR_GRADIENTS.length})`} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
