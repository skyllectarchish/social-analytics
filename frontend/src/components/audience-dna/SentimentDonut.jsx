import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { MessageCircle, TrendingUp, TrendingDown, Minus } from "lucide-react";
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

export default function SentimentDonut() {
  const { data, loading, error } = useSentimentSummary();

  if (loading) return <SkeletonChart height="h-[260px]" />;

  if (error) {
    return (
      <AnimatedCard className="p-5">
        <p className="text-xs text-rose-500">{error}</p>
      </AnimatedCard>
    );
  }

  const dist = data?.distribution ?? {};
  const positive = dist.positive ?? 0;
  const neutral = dist.neutral ?? 0;
  const negative = dist.negative ?? 0;
  const total = positive + neutral + negative;

  const prior = data?.prior;
  const priorDist = prior?.distribution;
  const priorTotal = prior?.total ?? 0;

  const pieData = [
    { name: "positive", value: positive },
    { name: "neutral", value: neutral },
    { name: "negative", value: negative },
  ];

  function deltaForBucket(name, currentValue) {
    if (!priorDist) return null;
    const currentPct = total > 0 ? (currentValue / total) * 100 : 0;
    const priorValue = priorDist[name] ?? 0;
    const priorPct = priorTotal > 0 ? (priorValue / priorTotal) * 100 : 0;
    return pctDelta(currentPct, priorPct);
  }

  return (
    <AnimatedCard className="p-5" delay={0.05}>
      <div className="flex items-start gap-2 mb-3">
        <MessageCircle size={14} className="text-violet-500 mt-0.5 shrink-0" />
        <div>
          <h3 className="text-sm font-semibold text-slate-800">
            Audience Sentiment
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Distribution across analysed comments.
          </p>
        </div>
      </div>

      {total === 0 ? (
        <p className="text-xs text-slate-400 py-12 text-center">
          No comments analysed yet.
        </p>
      ) : (
        <div className="flex items-center gap-5">
          <div className="w-[160px] h-[160px] relative shrink-0">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  innerRadius={48}
                  outerRadius={70}
                  startAngle={90}
                  endAngle={-270}
                  paddingAngle={2}
                  isAnimationActive
                  animationBegin={120}
                  animationDuration={650}
                >
                  {pieData.map((p) => (
                    <Cell key={p.name} fill={COLORS[p.name]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v, name) => [
                    `${v.toLocaleString()} (${total > 0 ? Math.round((v / total) * 100) : 0}%)`,
                    LABELS[name],
                  ]}
                  contentStyle={{
                    background: "rgba(255,255,255,0.98)",
                    border: "1px solid rgba(0,0,0,0.08)",
                    borderRadius: 12,
                    fontSize: 11,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="font-display text-2xl font-semibold text-slate-900">
                {total >= 1000
                  ? `${(total / 1000).toFixed(1)}K`
                  : total.toLocaleString()}
              </span>
              <span className="text-[9px] uppercase tracking-wider text-slate-400 mt-0.5">
                comments
              </span>
            </div>
          </div>

          <div className="flex-1 space-y-2 min-w-0">
            {pieData.map((p) => {
              const pct = total > 0 ? Math.round((p.value / total) * 100) : 0;
              const delta = deltaForBucket(p.name, p.value);
              const DeltaIcon =
                delta == null || delta === 0
                  ? Minus
                  : delta > 0
                    ? TrendingUp
                    : TrendingDown;
              const deltaColor =
                delta == null
                  ? "text-slate-400"
                  : p.name === "negative"
                    ? // For negative comments, "down is good" — invert the colour.
                      delta > 0
                      ? "text-rose-500"
                      : delta < 0
                        ? "text-emerald-600"
                        : "text-slate-400"
                    : delta > 0
                      ? "text-emerald-600"
                      : delta < 0
                        ? "text-rose-500"
                        : "text-slate-400";
              return (
                <div key={p.name}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ background: COLORS[p.name] }}
                      />
                      <span className="text-slate-600">{LABELS[p.name]}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {delta != null && (
                        <span className={`flex items-center gap-0.5 text-[10px] font-medium ${deltaColor}`}>
                          <DeltaIcon size={10} />
                          {Math.abs(delta).toFixed(1)}%
                        </span>
                      )}
                      <span className="font-mono text-slate-800 font-semibold">
                        {pct}%
                      </span>
                    </span>
                  </div>
                  <div
                    className="h-1.5 rounded-full overflow-hidden"
                    style={{ background: "rgba(15,23,42,0.05)" }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: "100%",
                        background: COLORS[p.name],
                        transition: "width 0.6s cubic-bezier(0.2, 0, 0, 1)",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </AnimatedCard>
  );
}
