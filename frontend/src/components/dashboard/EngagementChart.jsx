import { useState } from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Brush,
  ResponsiveContainer,
} from "recharts";
import { useOverview } from "../../hooks/useInsights";
import { alignSeriesByDate, attachPriorByIndex } from "../../utils/series";

function fmtNum(v) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(Math.round(v));
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const SERIES = [
  { key: "Views", color: "#7C3AED", label: "Views" },
  { key: "Reach", color: "#06B6D4", label: "Reach" },
  { key: "Interactions", color: "#EC4899", label: "Interactions" },
];

function GlassTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.98)",
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 16,
        padding: "14px 18px",
        backdropFilter: "blur(24px)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)",
        minWidth: 170,
      }}
    >
      <p
        style={{
          color: "#94A3B8",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          marginBottom: 12,
        }}
      >
        {label}
      </p>
      {payload.map((p) => (
        <div
          key={p.name}
          style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}
        >
          <div
            style={{
              width: 8, height: 8,
              borderRadius: "50%",
              background: p.color,
              boxShadow: `0 0 6px ${p.color}88`,
              flexShrink: 0,
            }}
          />
          <span style={{ color: "#64748B", fontSize: 12, flex: 1 }}>{p.name}</span>
          <span
            className="metric-value"
            style={{ color: "#0F172A", fontSize: 14 }}
          >
            {fmtNum(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function SeriesToggle({ hidden, onToggle }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      {SERIES.map((s) => {
        const isHidden = hidden.has(s.key);
        return (
          <button
            key={s.key}
            onClick={() => onToggle(s.key)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              fontWeight: 600,
              color: isHidden ? "#CBD5E1" : "#64748B",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              transition: "color 0.15s",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 22,
                height: 2.5,
                borderRadius: 2,
                background: isHidden ? "#E2E8F0" : s.color,
                boxShadow: isHidden ? "none" : `0 0 8px ${s.color}88`,
                transition: "all 0.15s",
              }}
            />
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div
      className="rounded-2xl p-5 animate-pulse d-card"
      style={{ height: 380 }}
    >
      <div className="h-4 w-40 rounded mb-4" style={{ background: "rgba(0,0,0,0.07)" }} />
      <div className="h-72 rounded-xl" style={{ background: "rgba(0,0,0,0.04)" }} />
    </div>
  );
}

export default function EngagementChart() {
  const { data: overview, loading, error } = useOverview();
  const [hidden, setHidden] = useState(new Set());

  const onToggle = (key) => {
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  if (loading) return <ChartSkeleton />;

  const viewsData = overview?.views?.data ?? [];
  const reachData = overview?.reach?.data ?? [];
  const interactData = overview?.total_interactions?.data ?? [];

  const priorViews = overview?.prior?.views?.data ?? [];
  const priorReach = overview?.prior?.reach?.data ?? [];
  const priorInteract = overview?.prior?.total_interactions?.data ?? [];
  const hasPrior = priorViews.length > 0 || priorReach.length > 0 || priorInteract.length > 0;

  const chartData = alignSeriesByDate({
    Views: viewsData,
    Reach: reachData,
    Interactions: interactData,
  }).map((row) => ({ ...row, date: fmtDate(row.end_time) }));

  if (hasPrior) {
    attachPriorByIndex(chartData, {
      ViewsPrior: priorViews,
      ReachPrior: priorReach,
      InteractionsPrior: priorInteract,
    });
  }

  const totals = {
    Views: viewsData.reduce((s, d) => s + (d.value ?? 0), 0),
    Reach: reachData.reduce((s, d) => s + (d.value ?? 0), 0),
    Interactions: interactData.reduce((s, d) => s + (d.value ?? 0), 0),
  };

  return (
    <div
      className="rounded-2xl p-5 d-card"
      style={{ boxShadow: "0 0 60px rgba(124,58,237,0.06)" }}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-5">
        <div>
          <p
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "#94A3B8",
              marginBottom: 8,
            }}
          >
            Engagement Overview
          </p>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            {SERIES.map((s) => (
              <div key={s.key}>
                <p
                  className="metric-value"
                  style={{ color: s.color, fontSize: 22, lineHeight: 1.1 }}
                >
                  {fmtNum(totals[s.key])}
                </p>
                <p style={{ color: "#94A3B8", fontSize: 10, marginTop: 2 }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
        <SeriesToggle hidden={hidden} onToggle={onToggle} />
      </div>

      {chartData.length === 0 ? (
        <div
          className="flex items-center justify-center rounded-xl text-sm"
          style={{ height: 320, color: "#94A3B8", background: "rgba(0,0,0,0.02)" }}
        >
          No data yet — run a sync first.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={330}>
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="viewsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7C3AED" stopOpacity={0.5} />
                <stop offset="85%" stopColor="#7C3AED" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="reachGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#06B6D4" stopOpacity={0.3} />
                <stop offset="85%" stopColor="#06B6D4" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid
              strokeDasharray="3 8"
              stroke="rgba(0,0,0,0.05)"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tick={{ fill: "#94A3B8", fontSize: 11, fontFamily: "system-ui" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: "#94A3B8", fontSize: 11, fontFamily: "system-ui" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={fmtNum}
              width={42}
            />
            <Tooltip
              content={<GlassTooltip />}
              cursor={{ stroke: "rgba(0,0,0,0.07)", strokeWidth: 1.5 }}
            />

            {!hidden.has("Views") && (
              <Area
                type="monotone"
                dataKey="Views"
                stroke="#7C3AED"
                strokeWidth={2.5}
                fill="url(#viewsGrad)"
                dot={false}
                activeDot={{ r: 5, fill: "#7C3AED", stroke: "rgba(124,58,237,0.35)", strokeWidth: 5 }}
                animationDuration={1200}
                animationEasing="ease-out"
                connectNulls
              />
            )}
            {!hidden.has("Reach") && (
              <Area
                type="monotone"
                dataKey="Reach"
                stroke="#06B6D4"
                strokeWidth={2}
                fill="url(#reachGrad)"
                dot={false}
                activeDot={{ r: 5, fill: "#06B6D4", stroke: "rgba(6,182,212,0.35)", strokeWidth: 5 }}
                strokeDasharray="6 3"
                animationDuration={1400}
                animationEasing="ease-out"
                connectNulls
              />
            )}
            {!hidden.has("Interactions") && (
              <Line
                type="monotone"
                dataKey="Interactions"
                stroke="#EC4899"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5, fill: "#EC4899", stroke: "rgba(236,72,153,0.35)", strokeWidth: 5 }}
                animationDuration={1600}
                animationEasing="ease-out"
                connectNulls
              />
            )}

            {hasPrior && !hidden.has("Views") && (
              <Line
                type="monotone"
                dataKey="ViewsPrior"
                stroke="#7C3AED"
                strokeWidth={1.5}
                strokeDasharray="3 4"
                strokeOpacity={0.4}
                dot={false}
                isAnimationActive={false}
                name="Views (prior)"
                connectNulls
              />
            )}
            {hasPrior && !hidden.has("Reach") && (
              <Line
                type="monotone"
                dataKey="ReachPrior"
                stroke="#06B6D4"
                strokeWidth={1.5}
                strokeDasharray="3 4"
                strokeOpacity={0.4}
                dot={false}
                isAnimationActive={false}
                name="Reach (prior)"
                connectNulls
              />
            )}
            {hasPrior && !hidden.has("Interactions") && (
              <Line
                type="monotone"
                dataKey="InteractionsPrior"
                stroke="#EC4899"
                strokeWidth={1.5}
                strokeDasharray="3 4"
                strokeOpacity={0.4}
                dot={false}
                isAnimationActive={false}
                name="Interactions (prior)"
                connectNulls
              />
            )}

            {chartData.length > 8 && (
              <Brush
                dataKey="date"
                height={22}
                stroke="rgba(0,0,0,0.08)"
                fill="rgba(0,0,0,0.02)"
                travellerWidth={5}
                tickFormatter={() => ""}
                startIndex={Math.max(0, chartData.length - 14)}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
