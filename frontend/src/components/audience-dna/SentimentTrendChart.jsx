import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import AnimatedCard from "../shared/AnimatedCard";
import { SkeletonChart } from "../shared/Skeleton";
import { useSentimentSummary } from "../../hooks/useSentiment";
import { pctDelta } from "../../utils/stats";

const COLORS = {
  positive: "#10b981",
  neutral: "#94a3b8",
  negative: "#f43f5e",
};

const LABELS = {
  positive: "Positive",
  neutral: "Neutral",
  negative: "Negative",
};

function fmtWeek(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function SentimentTrendChart() {
  const { data, loading, error } = useSentimentSummary();

  if (loading) return <SkeletonChart height="h-48" />;

  if (error) {
    return (
      <AnimatedCard className="p-5">
        <p className="text-xs text-rose-500">{error}</p>
      </AnimatedCard>
    );
  }

  const trend = (data?.trend ?? []).map((t) => ({
    ...t,
    week_start_label: fmtWeek(t.week_start),
  }));

  // Prior period — show the aggregate comparison in the header strip. The
  // area chart itself is normalised to 100% so a raw-count overlay doesn't
  // align visually; donut delta chips cover the per-bucket comparison.
  const prior = data?.prior;
  const totalCurrent = data?.total ?? 0;
  const totalPrior = prior?.total ?? null;
  const totalDelta = totalPrior != null ? pctDelta(totalCurrent, totalPrior) : null;
  const DeltaIcon =
    totalDelta == null || totalDelta === 0
      ? Minus
      : totalDelta > 0
        ? TrendingUp
        : TrendingDown;
  const deltaColor =
    totalDelta == null
      ? "text-slate-400"
      : totalDelta > 0
        ? "text-emerald-600"
        : totalDelta < 0
          ? "text-rose-500"
          : "text-slate-400";

  return (
    <AnimatedCard className="p-5" delay={0.12}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">
            Sentiment trend
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Weekly mix of positive, neutral, and negative comments.
          </p>
        </div>
        {prior && (
          <div className="text-right shrink-0">
            <p className="text-[10px] uppercase tracking-wider text-slate-400">
              vs prior
            </p>
            <p className={`text-xs font-mono flex items-center justify-end gap-1 ${deltaColor}`}>
              <DeltaIcon size={11} />
              {totalDelta == null ? "—" : `${Math.abs(totalDelta).toFixed(1)}%`}
            </p>
            <p className="text-[10px] text-slate-400">
              {totalPrior?.toLocaleString()} prior
            </p>
          </div>
        )}
      </div>

      {trend.length === 0 ? (
        <p className="text-xs text-slate-400 py-12 text-center">
          Not enough comment history yet.
        </p>
      ) : (
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={trend}
              margin={{ left: 0, right: 12, top: 8, bottom: 8 }}
              stackOffset="expand"
            >
              <defs>
                <linearGradient id="sentPos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.positive} stopOpacity={0.6} />
                  <stop offset="100%" stopColor={COLORS.positive} stopOpacity={0.15} />
                </linearGradient>
                <linearGradient id="sentNeu" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.neutral} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={COLORS.neutral} stopOpacity={0.12} />
                </linearGradient>
                <linearGradient id="sentNeg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.negative} stopOpacity={0.55} />
                  <stop offset="100%" stopColor={COLORS.negative} stopOpacity={0.12} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(15,23,42,0.06)"
              />
              <XAxis
                dataKey="week_start_label"
                stroke="#94a3b8"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: "rgba(15,23,42,0.08)" }}
              />
              <YAxis
                stroke="#94a3b8"
                fontSize={11}
                tickFormatter={(v) => `${Math.round(v * 100)}%`}
                tickLine={false}
                axisLine={false}
                width={42}
              />
              <Tooltip
                formatter={(v, name) => [
                  Number(v).toLocaleString(),
                  LABELS[name] ?? name,
                ]}
                contentStyle={{
                  background: "rgba(255,255,255,0.98)",
                  border: "1px solid rgba(0,0,0,0.08)",
                  borderRadius: 12,
                  fontSize: 11,
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
                formatter={(name) => LABELS[name] ?? name}
              />
              <Area
                type="monotone"
                dataKey="positive"
                stackId="1"
                stroke={COLORS.positive}
                fill="url(#sentPos)"
                strokeWidth={1.5}
              />
              <Area
                type="monotone"
                dataKey="neutral"
                stackId="1"
                stroke={COLORS.neutral}
                fill="url(#sentNeu)"
                strokeWidth={1.5}
              />
              <Area
                type="monotone"
                dataKey="negative"
                stackId="1"
                stroke={COLORS.negative}
                fill="url(#sentNeg)"
                strokeWidth={1.5}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </AnimatedCard>
  );
}
