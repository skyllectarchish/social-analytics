import { Gauge, Sparkles, Moon, Users } from "lucide-react";
import AnimatedCard from "../shared/AnimatedCard";
import ComparisonMetricPill from "../shared/ComparisonMetricPill";
import { SkeletonMetric } from "../shared/Skeleton";
import { useFollowerQualitySummary } from "../../hooks/useTier1Insights";

const CARDS = [
  {
    key: "overall_quality_pct",
    label: "Quality Score",
    color: "glow-violet",
    iconColor: "#8b5cf6",
    Icon: Gauge,
    suffix: "%",
    decimals: 1,
  },
  {
    key: "high_quality_cohorts",
    label: "High-Quality Cohorts",
    color: "glow-emerald",
    iconColor: "#10b981",
    Icon: Sparkles,
    suffix: "",
    decimals: 0,
  },
  {
    key: "dormant_cohorts",
    label: "Dormant Cohorts",
    color: "glow-pink",
    iconColor: "#f43f5e",
    Icon: Moon,
    suffix: "",
    decimals: 0,
  },
  {
    key: "total_followers_tracked",
    label: "Followers Tracked",
    color: "",
    iconColor: "#64748b",
    Icon: Users,
    suffix: "",
    decimals: 0,
  },
];

export default function QualityHeroMetrics({ breakdown = "age" }) {
  const { data, loading, error } = useFollowerQualitySummary(breakdown);

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
              data={data?.[c.key] ?? 0}
              suffix={c.suffix}
              decimals={c.decimals}
            />
          </AnimatedCard>
        );
      })}
    </div>
  );
}
