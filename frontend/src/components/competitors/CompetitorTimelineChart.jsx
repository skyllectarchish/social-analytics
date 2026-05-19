import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import AnimatedCard from "../shared/AnimatedCard";
import { SkeletonChart } from "../shared/Skeleton";
import { useCompetitorTimeline } from "../../hooks/useCompetitors";

const PALETTE = ["#06b6d4", "#ec4899", "#f59e0b", "#10b981", "#f43f5e", "#84cc16"];

function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtFollowers(v) {
  if (v == null) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}

export default function CompetitorTimelineChart() {
  const { data, loading, error } = useCompetitorTimeline();

  const { chartData, series } = useMemo(() => {
    if (!data?.series) return { chartData: [], series: [] };
    const allDates = new Set();
    data.series.forEach((s) =>
      (s.points ?? []).forEach((p) => allDates.add(p.date)),
    );
    const sortedDates = [...allDates].sort();
    const pointsByHandle = new Map();
    data.series.forEach((s) => {
      const m = new Map();
      (s.points ?? []).forEach((p) => m.set(p.date, p.followers));
      pointsByHandle.set(s.handle, m);
    });
    const rows = sortedDates.map((d) => {
      const row = { date: d, dateLabel: fmtDate(d) };
      data.series.forEach((s) => {
        row[s.handle] = pointsByHandle.get(s.handle)?.get(d) ?? null;
      });
      return row;
    });
    const seriesMeta = data.series.map((s, i) => ({
      handle: s.handle,
      display: s.display_name ?? (s.handle === "you" ? "You" : `@${s.handle}`),
      color: s.handle === "you" ? "#7c3aed" : PALETTE[i % PALETTE.length],
      isSelf: s.handle === "you",
    }));
    return { chartData: rows, series: seriesMeta };
  }, [data]);

  if (loading) return <SkeletonChart height="h-[340px]" />;

  if (error) {
    return (
      <AnimatedCard className="p-5">
        <p className="text-xs text-rose-500">{error}</p>
      </AnimatedCard>
    );
  }

  if (!series.length) {
    return (
      <AnimatedCard className="p-5">
        <h3 className="text-sm font-semibold text-slate-800 mb-1">
          Follower growth
        </h3>
        <p className="text-xs text-slate-400 py-10 text-center">
          Add competitors to compare growth over time.
        </p>
      </AnimatedCard>
    );
  }

  return (
    <AnimatedCard className="p-5" delay={0.1}>
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-800">Follower growth</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Daily snapshot per tracked account over the current period.
        </p>
      </div>

      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ left: 0, right: 12, top: 8, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.06)" />
            <XAxis
              dataKey="dateLabel"
              stroke="#94a3b8"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: "rgba(15,23,42,0.08)" }}
            />
            <YAxis
              stroke="#94a3b8"
              fontSize={11}
              tickFormatter={fmtFollowers}
              tickLine={false}
              axisLine={false}
              width={42}
            />
            <Tooltip
              formatter={(v) => fmtFollowers(v)}
              contentStyle={{
                background: "rgba(255,255,255,0.98)",
                border: "1px solid rgba(0,0,0,0.08)",
                borderRadius: 12,
                fontSize: 11,
              }}
            />
            <Legend
              iconType="line"
              wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
            />
            {series.map((s) => (
              <Line
                key={s.handle}
                type="monotone"
                dataKey={s.handle}
                name={s.display}
                stroke={s.color}
                strokeWidth={s.isSelf ? 2.5 : 1.8}
                dot={false}
                activeDot={{
                  r: 4,
                  strokeWidth: 2,
                  fill: s.color,
                  stroke: "#fff",
                }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </AnimatedCard>
  );
}
