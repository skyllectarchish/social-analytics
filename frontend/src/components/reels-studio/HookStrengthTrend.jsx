import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ComposedChart,
} from "recharts";
import AnimatedCard from "../shared/AnimatedCard";
import { SkeletonChart } from "../shared/Skeleton";
import { useReelsTrend } from "../../hooks/useTier1Insights";

function fmtWeek(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const hook = payload.find((p) => p.dataKey === "avg_hook_strength_pct")?.value;
  const watch = payload.find((p) => p.dataKey === "avg_watch_time_sec")?.value;
  const reels = payload[0]?.payload?.reels_count;
  return (
    <div
      className="glass-strong rounded-xl p-3"
      style={{ minWidth: 180, boxShadow: "0 8px 24px rgba(15,23,42,0.10)" }}
    >
      <p className="text-xs font-semibold text-slate-900 mb-1">
        Week of {fmtWeek(label)}
      </p>
      <p className="text-[11px] text-slate-500 mb-2">{reels ?? 0} reels</p>
      <div className="space-y-0.5 text-[11px]">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: "#8b5cf6" }} />
            Hook Strength
          </span>
          <span className="font-mono font-semibold text-slate-800">
            {(hook ?? 0).toFixed(1)}%
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: "#06b6d4" }} />
            Watch Time
          </span>
          <span className="font-mono font-semibold text-slate-800">
            {(watch ?? 0).toFixed(1)}s
          </span>
        </div>
      </div>
    </div>
  );
}

export default function HookStrengthTrend() {
  const { data, loading, error } = useReelsTrend();

  if (loading) {
    return (
      <AnimatedCard className="p-5">
        <SkeletonChart height="h-72" />
      </AnimatedCard>
    );
  }

  if (error) {
    return (
      <AnimatedCard className="p-5">
        <p className="text-xs text-rose-500">{error}</p>
      </AnimatedCard>
    );
  }

  const priorTrend = data?.prior?.trend ?? [];
  const hasPrior = priorTrend.length > 0;
  const trend = (data?.trend ?? []).map((t, i) => ({
    ...t,
    week_start_label: fmtWeek(t.week_start),
    avg_hook_strength_pct_prior: priorTrend[i]?.avg_hook_strength_pct ?? null,
  }));

  return (
    <AnimatedCard className="p-5" delay={0.05}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">
            Hook Strength Trend
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Weekly average — are your openers getting better at holding viewers?
          </p>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-slate-400">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: "#8b5cf6" }} />
            Hook %
          </span>
          <span className="flex items-center gap-1">
            <span
              className="w-3 h-px"
              style={{
                borderTop: "1.5px dashed #06b6d4",
              }}
            />
            Watch (s)
          </span>
        </div>
      </div>

      {trend.length === 0 ? (
        <p className="text-xs text-slate-400 py-12 text-center">
          Not enough Reels data yet. Run a sync to populate.
        </p>
      ) : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={trend}
              margin={{ left: 0, right: 12, top: 8, bottom: 8 }}
            >
              <defs>
                <linearGradient id="hookGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.06)" />
              <XAxis
                dataKey="week_start_label"
                stroke="#94a3b8"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: "rgba(15,23,42,0.08)" }}
              />
              <YAxis
                yAxisId="left"
                stroke="#94a3b8"
                fontSize={11}
                tickFormatter={(v) => `${v.toFixed(0)}%`}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#94a3b8"
                fontSize={11}
                tickFormatter={(v) => `${v.toFixed(0)}s`}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="avg_hook_strength_pct"
                stroke="#8b5cf6"
                fill="url(#hookGradient)"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, strokeWidth: 2, fill: "#8b5cf6", stroke: "#fff" }}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="avg_watch_time_sec"
                stroke="#06b6d4"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, fill: "#06b6d4", stroke: "#fff" }}
              />
              {hasPrior && (
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="avg_hook_strength_pct_prior"
                  stroke="#8b5cf6"
                  strokeWidth={1.5}
                  strokeDasharray="3 4"
                  strokeOpacity={0.4}
                  dot={false}
                  isAnimationActive={false}
                  name="Hook (prior)"
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </AnimatedCard>
  );
}
