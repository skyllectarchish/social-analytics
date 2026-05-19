import AnimatedCard from "../shared/AnimatedCard";
import { SkeletonChart } from "../shared/Skeleton";
import { useCompetitors } from "../../hooks/useCompetitors";

const COLS = [
  {
    key: "followers_count",
    label: "Followers",
    fmt: (v) =>
      v == null ? "—" : v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(1)}K` : String(v),
  },
  {
    key: "avg_engagement_rate_pct",
    label: "Eng. rate",
    fmt: (v) => (v == null ? "—" : `${v.toFixed(1)}%`),
  },
  {
    key: "posts_last_7d",
    label: "Posts/wk",
    fmt: (v) => (v == null ? "—" : String(v)),
  },
  {
    key: "reels_last_7d",
    label: "Reels/wk",
    fmt: (v) => (v == null ? "—" : String(v)),
  },
];

function median(xs) {
  const valid = xs.filter((v) => v != null).sort((a, b) => a - b);
  if (!valid.length) return null;
  const mid = Math.floor(valid.length / 2);
  return valid.length % 2 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
}

export default function CompetitorMetricsTable() {
  const { data, loading, error } = useCompetitors();

  if (loading) return <SkeletonChart height="h-[280px]" />;

  if (error) {
    return (
      <AnimatedCard className="p-5">
        <p className="text-xs text-rose-500">{error}</p>
      </AnimatedCard>
    );
  }

  const competitors = data?.competitors ?? [];
  const you = data?.you;
  const hasAny = you || competitors.length;

  if (!hasAny) {
    return (
      <AnimatedCard className="p-5">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">
          Side-by-side metrics
        </h3>
        <p className="text-xs text-slate-400 py-8 text-center">
          Add competitors on the left to see side-by-side benchmarks.
        </p>
      </AnimatedCard>
    );
  }

  const rows = [];
  if (you) rows.push({ handle: "You", _isSelf: true, ...you });
  competitors.forEach((c) =>
    rows.push({ handle: c.handle, _isSelf: false, ...(c.latest_snapshot ?? {}) }),
  );

  const medians = Object.fromEntries(
    COLS.map((c) => [
      c.key,
      median(competitors.map((x) => x.latest_snapshot?.[c.key])),
    ]),
  );

  return (
    <AnimatedCard className="p-5" delay={0.05}>
      <h3 className="text-sm font-semibold text-slate-800 mb-1">
        Side-by-side metrics
      </h3>
      <p className="text-xs text-slate-500 mb-4">
        Niche median is highlighted on your row when you beat it.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
              <th className="text-left py-2 pr-4">Account</th>
              {COLS.map((c) => (
                <th key={c.key} className="text-right py-2 px-3">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.handle}
                className={r._isSelf ? "bg-violet-50/50" : "hover:bg-slate-50/40"}
              >
                <td className="py-2 pr-4 text-xs">
                  {r._isSelf ? (
                    <span className="text-violet-700 font-semibold">You</span>
                  ) : (
                    <span className="text-slate-700">@{r.handle}</span>
                  )}
                </td>
                {COLS.map((c) => {
                  const v = r[c.key];
                  const m = medians[c.key];
                  const aboveMedian =
                    r._isSelf && v != null && m != null && v > m;
                  return (
                    <td
                      key={c.key}
                      className={`text-right py-2 px-3 text-xs font-mono ${
                        aboveMedian
                          ? "text-emerald-700 font-semibold"
                          : "text-slate-700"
                      }`}
                    >
                      {c.fmt(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-slate-400 mt-3 leading-relaxed">
        Engagement is computed as (likes + comments) ÷ followers across the
        last 25 posts for every account — your row uses the same formula as
        competitor rows, so values are directly comparable.
      </p>
    </AnimatedCard>
  );
}
