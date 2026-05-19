import { useMemo } from "react";
import { Zap, Clock, SkipForward, Repeat } from "lucide-react";
import AnimatedCard from "../shared/AnimatedCard";
import ComparisonMetricPill from "../shared/ComparisonMetricPill";
import { SkeletonMetric } from "../shared/Skeleton";
import { useReelsRetention } from "../../hooks/useTier1Insights";
import { welchsTTest } from "../../utils/stats";

function avg(arr, key) {
  if (!arr.length) return 0;
  return arr.reduce((sum, r) => sum + (r[key] ?? 0), 0) / arr.length;
}

function variance(arr, key, mean) {
  if (arr.length < 2) return 0;
  return (
    arr.reduce((s, r) => s + ((r[key] ?? 0) - mean) ** 2, 0) / (arr.length - 1)
  );
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

export default function ReelsHeroMetrics() {
  const { data, loading, error } = useReelsRetention();

  const values = useMemo(() => {
    const reels = data?.reels ?? [];
    const priorReels = data?.prior?.reels;
    const KEY_MAP = {
      hook: "hook_strength_pct",
      watch: "avg_watch_time",
      skip: "skip_rate",
      replay: "estimated_replay_rate",
    };
    const compute = (arr) => ({
      hook: avg(arr, KEY_MAP.hook),
      watch: avg(arr, KEY_MAP.watch),
      skip: avg(arr, KEY_MAP.skip),
      replay: avg(arr, KEY_MAP.replay),
    });
    const current = compute(reels);
    if (!priorReels) return current;
    const prior = compute(priorReels);
    // Welch's t on per-Reel samples — significance reflects whether the shift
    // in mean is bigger than within-period variance, not just nominal delta.
    return Object.fromEntries(
      Object.entries(current).map(([k, v]) => {
        const col = KEY_MAP[k];
        const vCur = variance(reels, col, v);
        const vPrior = variance(priorReels, col, prior[k]);
        const { significant } = welchsTTest(
          v, vCur, reels.length, prior[k], vPrior, priorReels.length,
        );
        return [k, { current: v, prior: prior[k], delta_pct: null, significant }];
      }),
    );
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
            <ComparisonMetricPill
              label={c.label}
              data={values[c.key]}
              suffix={c.suffix}
              decimals={c.decimals}
            />
          </AnimatedCard>
        );
      })}
    </div>
  );
}
