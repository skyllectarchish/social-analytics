import { useMemo } from "react";
import { Zap, Clock, SkipForward, Repeat } from "lucide-react";
import AnimatedCard from "../shared/AnimatedCard";
import MetricPill from "../shared/MetricPill";
import { SkeletonMetric } from "../shared/Skeleton";
import { useReelsRetention } from "../../hooks/useTier1Insights";

function avg(arr, key) {
  if (!arr.length) return 0;
  return arr.reduce((sum, r) => sum + (r[key] ?? 0), 0) / arr.length;
}

const CARDS = [
  {
    key: "hook",
    label: "Avg Hook Strength",
    color: "glow-violet",
    iconColor: "#8b5cf6",
    Icon: Zap,
    suffix: "%",
    decimals: 1,
  },
  {
    key: "watch",
    label: "Avg Watch Time",
    color: "glow-cyan",
    iconColor: "#06b6d4",
    Icon: Clock,
    suffix: "s",
    decimals: 1,
  },
  {
    key: "skip",
    label: "Avg Skip Rate",
    color: "glow-pink",
    iconColor: "#ec4899",
    Icon: SkipForward,
    suffix: "%",
    decimals: 1,
  },
  {
    key: "replay",
    label: "Avg Replay Rate",
    color: "glow-emerald",
    iconColor: "#10b981",
    Icon: Repeat,
    suffix: "%",
    decimals: 2,
  },
];

export default function ReelsHeroMetrics({ days = 90 }) {
  const { data, loading, error } = useReelsRetention(days);

  const values = useMemo(() => {
    const reels = data?.reels ?? [];
    return {
      hook: avg(reels, "hook_strength_pct"),
      watch: avg(reels, "avg_watch_time"),
      skip: avg(reels, "skip_rate"),
      replay: avg(reels, "estimated_replay_rate"),
    };
  }, [data]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {CARDS.map((c) => (
          <div key={c.key} className="d-card">
            <SkeletonMetric />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <AnimatedCard className="p-4">
        <p className="text-xs text-rose-500">{error}</p>
      </AnimatedCard>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {CARDS.map((c, i) => {
        const Icon = c.Icon;
        return (
          <AnimatedCard
            key={c.key}
            delay={i * 0.05}
            className={`p-5 ${c.color}`}
          >
            <div className="flex items-start justify-between mb-2">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ background: `${c.iconColor}15` }}
              >
                <Icon size={18} color={c.iconColor} strokeWidth={2} />
              </div>
            </div>
            <MetricPill
              label={c.label}
              value={values[c.key]}
              suffix={c.suffix}
              decimals={c.decimals}
            />
          </AnimatedCard>
        );
      })}
    </div>
  );
}
