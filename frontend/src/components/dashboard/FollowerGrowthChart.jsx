import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { useOverview } from "../../hooks/useInsights";
import { alignSeriesByDate } from "../../utils/series";

function fmtNum(v) {
  const abs = Math.abs(v);
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function GlassTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value ?? 0;
  const isPos = val >= 0;
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.98)",
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 14,
        padding: "12px 16px",
        backdropFilter: "blur(24px)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.10)",
        minWidth: 150,
      }}
    >
      <p style={{ color: "#94A3B8", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10 }}>
        {label}
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 8, height: 8, borderRadius: "50%",
            background: isPos ? "#10B981" : "#F43F5E",
            boxShadow: `0 0 6px ${isPos ? "#10B981" : "#F43F5E"}88`,
          }}
        />
        <span style={{ color: "#64748B", fontSize: 12 }}>Net change</span>
        <span
          className="metric-value"
          style={{
            color: isPos ? "#059669" : "#DC2626",
            fontSize: 14,
            marginLeft: "auto",
          }}
        >
          {isPos ? "+" : ""}{val}
        </span>
      </div>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div
      className="rounded-2xl p-5 animate-pulse d-card"
      style={{ height: "100%", minHeight: 280 }}
    >
      <div className="h-4 w-36 rounded mb-4" style={{ background: "rgba(0,0,0,0.07)" }} />
      <div className="h-8 w-20 rounded mb-2" style={{ background: "rgba(0,0,0,0.07)" }} />
      <div className="h-48 rounded-xl" style={{ background: "rgba(0,0,0,0.04)" }} />
    </div>
  );
}

export default function FollowerGrowthChart() {
  const { data: overview, loading } = useOverview();

  if (loading) return <ChartSkeleton />;

  const followsData = overview?.follows_and_unfollows?.data ?? [];
  const priorFollows = overview?.prior?.follows_and_unfollows?.data ?? [];
  const hasPrior = priorFollows.length > 0;
  const netTotal = followsData.reduce((s, d) => s + (d.value ?? 0), 0);
  const priorNetTotal = priorFollows.reduce((s, d) => s + (d.value ?? 0), 0);
  const isNetPos = netTotal >= 0;

  const chartData = alignSeriesByDate({ value: followsData }).map((row) => ({
    ...row,
    date: fmtDate(row.end_time),
  }));

  return (
    <div
      className="rounded-2xl p-5 d-card"
      style={{ height: "100%" }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#94A3B8", marginBottom: 8 }}>
            Follower Change
          </p>
          <p
            className="metric-value"
            style={{ fontSize: 28, color: isNetPos ? "#059669" : "#DC2626", lineHeight: 1.1 }}
          >
            {isNetPos ? "+" : ""}{fmtNum(netTotal)}
          </p>
          <p style={{ color: "#94A3B8", fontSize: 11, marginTop: 3 }}>
            net this period
            {hasPrior && (
              <span style={{ marginLeft: 6, color: "#64748B" }}>
                · prior {priorNetTotal >= 0 ? "+" : ""}{fmtNum(priorNetTotal)}
              </span>
            )}
          </p>
        </div>

        {/* Legend */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end", paddingTop: 2 }}>
          {[
            { label: "Gained", color: "#10B981" },
            { label: "Lost", color: "#F43F5E" },
          ].map((l) => (
            <span key={l.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#475569" }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: l.color, display: "inline-block", boxShadow: `0 0 6px ${l.color}88` }} />
              {l.label}
            </span>
          ))}
        </div>
      </div>

      {chartData.length === 0 ? (
        <div
          className="flex items-center justify-center rounded-xl text-sm"
          style={{ height: 220, color: "#94A3B8", background: "rgba(0,0,0,0.02)" }}
        >
          No data yet — run a sync first.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={230}>
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="posGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34D399" stopOpacity={1} />
                <stop offset="100%" stopColor="#059669" stopOpacity={0.65} />
              </linearGradient>
              <linearGradient id="negGrad" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="#F87171" stopOpacity={1} />
                <stop offset="100%" stopColor="#DC2626" stopOpacity={0.65} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 8" stroke="rgba(0,0,0,0.05)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: "#94A3B8", fontSize: 10, fontFamily: "system-ui" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: "#94A3B8", fontSize: 10, fontFamily: "system-ui" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={fmtNum}
              width={36}
            />
            <ReferenceLine y={0} stroke="rgba(0,0,0,0.12)" strokeWidth={1} />
            <Tooltip content={<GlassTooltip />} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={20} animationDuration={1000}>
              {chartData.map((d, i) => (
                <Cell
                  key={i}
                  fill={d.value == null ? "transparent" : d.value >= 0 ? "url(#posGrad)" : "url(#negGrad)"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
