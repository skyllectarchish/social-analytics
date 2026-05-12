import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import AnimatedCard from "../shared/AnimatedCard";
import { SkeletonChart } from "../shared/Skeleton";
import { useFollowerQuality } from "../../hooks/useTier1Insights";

const TIER_STYLES = {
  HIGH: "bg-emerald-50 text-emerald-700 border-emerald-200",
  MEDIUM: "bg-amber-50 text-amber-700 border-amber-200",
  LOW: "bg-slate-50 text-slate-600 border-slate-200",
  DORMANT: "bg-rose-50 text-rose-700 border-rose-200",
};

const RATE_BAR_COLOR = {
  HIGH: "#10b981",
  MEDIUM: "#f59e0b",
  LOW: "#94a3b8",
  DORMANT: "#f43f5e",
};

const COLUMNS = [
  { key: "dimension_value", label: "Cohort", sortable: false, className: "flex-1 min-w-0" },
  { key: "follower_count", label: "Followers", sortable: true, className: "w-32" },
  { key: "engaged_count", label: "Engaged", sortable: true, className: "w-24" },
  { key: "engagement_rate_pct", label: "Rate", sortable: true, className: "w-32" },
  { key: "quality_tier", label: "Tier", sortable: true, className: "w-24" },
];

function SortIcon({ active, dir }) {
  if (!active) return <ArrowUpDown size={11} className="text-slate-300" />;
  return dir === "asc" ? (
    <ArrowUp size={11} className="text-violet-600" />
  ) : (
    <ArrowDown size={11} className="text-violet-600" />
  );
}

function MiniBar({ value, max, color }) {
  const pct = max > 0 ? Math.min(1, value / max) * 100 : 0;
  return (
    <div className="w-16 h-1 rounded-full bg-slate-100 overflow-hidden">
      <div
        className="h-full rounded-full"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

const TIER_RANK = { HIGH: 4, MEDIUM: 3, LOW: 2, DORMANT: 1 };

function compare(a, b, key) {
  if (key === "quality_tier") {
    return (TIER_RANK[a[key]] ?? 0) - (TIER_RANK[b[key]] ?? 0);
  }
  return (a[key] ?? 0) - (b[key] ?? 0);
}

export default function CohortQualityTable({ breakdown = "age" }) {
  const { data, loading, error } = useFollowerQuality(breakdown);
  const [sortKey, setSortKey] = useState("engagement_rate_pct");
  const [sortDir, setSortDir] = useState("desc");

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const { rows, maxFollowers, maxRate } = useMemo(() => {
    const cohorts = [...(data?.cohorts ?? [])];
    cohorts.sort((a, b) =>
      sortDir === "asc" ? compare(a, b, sortKey) : compare(b, a, sortKey),
    );
    return {
      rows: cohorts,
      maxFollowers: Math.max(1, ...cohorts.map((c) => c.follower_count)),
      maxRate: Math.max(1, ...cohorts.map((c) => c.engagement_rate_pct)),
    };
  }, [data, sortKey, sortDir]);

  if (loading) {
    return (
      <AnimatedCard className="p-5">
        <SkeletonChart height="h-80" />
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
    <AnimatedCard className="p-5" delay={0.08}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">
            Cohort Quality
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Ranked by engagement rate — your highest-leverage follower segments.
          </p>
        </div>
        <span className="text-[11px] text-slate-400">{rows.length} cohorts</span>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-slate-400 py-12 text-center">
          No cohorts available for this breakdown.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-3 px-2 py-2 border-b border-slate-100">
            {COLUMNS.map((c) => (
              <div
                key={c.key}
                className={`${c.className} text-[10px] uppercase tracking-wider font-semibold text-slate-500`}
              >
                {c.sortable ? (
                  <button
                    onClick={() => toggleSort(c.key)}
                    className="flex items-center gap-1 hover:text-slate-800 transition-colors"
                  >
                    {c.label}
                    <SortIcon active={sortKey === c.key} dir={sortDir} />
                  </button>
                ) : (
                  c.label
                )}
              </div>
            ))}
          </div>

          <div className="max-h-[360px] overflow-y-auto">
            {rows.map((r, i) => (
              <motion.div
                key={`${breakdown}-${r.dimension_value}`}
                layout
                initial={{ opacity: 0, y: 6, filter: "blur(2px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{
                  type: "spring",
                  duration: 0.4,
                  bounce: 0,
                  delay: Math.min(i * 0.025, 0.3),
                }}
                className="flex items-center gap-3 px-2 py-3 border-b border-slate-50"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-800 truncate">
                    {r.dimension_value || "—"}
                  </p>
                </div>
                <div className="w-32 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-slate-700 w-12">
                      {r.follower_count.toLocaleString()}
                    </span>
                    <MiniBar
                      value={r.follower_count}
                      max={maxFollowers}
                      color="#8b5cf6"
                    />
                  </div>
                </div>
                <div className="w-24 shrink-0">
                  <span className="font-mono text-[11px] text-slate-700">
                    {r.engaged_count.toLocaleString()}
                  </span>
                </div>
                <div className="w-32 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-slate-700 w-10">
                      {r.engagement_rate_pct.toFixed(1)}%
                    </span>
                    <MiniBar
                      value={r.engagement_rate_pct}
                      max={maxRate}
                      color={RATE_BAR_COLOR[r.quality_tier] ?? "#94a3b8"}
                    />
                  </div>
                </div>
                <div className="w-24 shrink-0">
                  <span
                    className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-md border ${
                      TIER_STYLES[r.quality_tier] ?? TIER_STYLES.LOW
                    }`}
                  >
                    {r.quality_tier}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </>
      )}
    </AnimatedCard>
  );
}
