import { useMemo } from "react";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import { motion } from "framer-motion";
import AnimatedCard from "../shared/AnimatedCard";
import { SkeletonChart } from "../shared/Skeleton";
import { useFollowerQuality } from "../../hooks/useTier1Insights";

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div
      className="glass-strong rounded-xl p-3"
      style={{ minWidth: 160, boxShadow: "0 8px 24px rgba(15,23,42,0.10)" }}
    >
      <p className="text-xs font-semibold text-slate-900 mb-1">{d.cohort}</p>
      <div className="space-y-0.5 text-[11px]">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: "#8b5cf6" }} />
            Followers
          </span>
          <span className="font-mono font-semibold text-slate-800">
            {d.follower_count.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: "#ec4899" }} />
            Engaged
          </span>
          <span className="font-mono font-semibold text-slate-800">
            {d.engaged_count.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-100 mt-1">
          <span className="text-slate-500">Rate</span>
          <span className="font-mono font-semibold text-slate-800">
            {d.rate_pct.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}

export default function QualityRadar({ breakdown = "age" }) {
  const { data, loading, error } = useFollowerQuality(breakdown);

  const rows = useMemo(() => {
    const cohorts = data?.cohorts ?? [];
    if (!cohorts.length) return [];
    const maxF = Math.max(1, ...cohorts.map((c) => c.follower_count));
    return cohorts.map((c) => ({
      cohort: c.dimension_value || "—",
      follower_count: c.follower_count,
      engaged_count: c.engaged_count,
      rate_pct: c.engagement_rate_pct,
      followers_norm: (c.follower_count / maxF) * 100,
      engaged_norm: (c.engaged_count / maxF) * 100,
    }));
  }, [data]);

  if (loading) {
    return (
      <AnimatedCard className="p-5">
        <SkeletonChart height="h-56" />
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

  return (
    <AnimatedCard className="p-5" delay={0.05}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">
            Audience Quality Shape
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Followers vs. engaged across each {breakdown} cohort. Wider gap = more
            dormant.
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-slate-400 py-16 text-center">
          No audience data for this breakdown yet.
        </p>
      ) : (
        <motion.div
          key={breakdown}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", duration: 0.5, bounce: 0 }}
          className="h-56"
        >
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={rows} outerRadius="72%">
              <PolarGrid stroke="rgba(15,23,42,0.08)" />
              <PolarAngleAxis
                dataKey="cohort"
                tick={{ fontSize: 11, fill: "#64748b" }}
              />
              <PolarRadiusAxis
                angle={90}
                tick={false}
                axisLine={false}
                domain={[0, 100]}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                iconType="circle"
                wrapperStyle={{ fontSize: 11, color: "#64748b" }}
              />
              <Radar
                name="Followers"
                dataKey="followers_norm"
                stroke="#8b5cf6"
                fill="#8b5cf6"
                fillOpacity={0.18}
                strokeWidth={2}
                isAnimationActive
              />
              <Radar
                name="Engaged"
                dataKey="engaged_norm"
                stroke="#ec4899"
                fill="#ec4899"
                fillOpacity={0.05}
                strokeWidth={2}
                isAnimationActive
              />
            </RadarChart>
          </ResponsiveContainer>
        </motion.div>
      )}
    </AnimatedCard>
  );
}
