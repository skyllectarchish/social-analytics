import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import AnimatedCard from "../shared/AnimatedCard";
import { SkeletonChart } from "../shared/Skeleton";
import { useReelsRetention } from "../../hooks/useTier1Insights";

const COLUMNS = [
  { key: "thumb", label: "", sortable: false, width: "w-14" },
  { key: "caption_preview", label: "Caption", sortable: false, width: "flex-1 min-w-0" },
  { key: "hook_strength_pct", label: "Hook %", sortable: true, width: "w-24" },
  { key: "avg_watch_time", label: "Watch", sortable: true, width: "w-28" },
  { key: "skip_rate", label: "Skip", sortable: true, width: "w-24" },
  { key: "estimated_replay_rate", label: "Replay", sortable: true, width: "w-20" },
];

function hookColor(pct) {
  if (pct >= 80) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (pct >= 60) return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-rose-50 text-rose-700 border-rose-200";
}

function SortIcon({ active, dir }) {
  if (!active) return <ArrowUpDown size={11} className="text-slate-300" />;
  return dir === "asc" ? (
    <ArrowUp size={11} className="text-violet-600" />
  ) : (
    <ArrowDown size={11} className="text-violet-600" />
  );
}

function MiniBar({ value, max, color = "#06b6d4" }) {
  const pct = max > 0 ? Math.min(1, value / max) * 100 : 0;
  return (
    <div className="w-12 h-1 rounded-full bg-slate-100 overflow-hidden">
      <div
        className="h-full rounded-full"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

function adaptForDrawer(reel) {
  return {
    ig_media_id: reel.ig_media_id,
    media_type: "VIDEO",
    media_url: "",
    thumbnail_url: "",
    permalink: reel.permalink,
    caption: reel.caption_preview,
    timestamp: reel.timestamp,
  };
}

export default function ReelsRetentionTable({ onSelect }) {
  const { data, loading, error } = useReelsRetention();
  const [sortKey, setSortKey] = useState("hook_strength_pct");
  const [sortDir, setSortDir] = useState("desc");

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const { rows, maxWatch, maxSkip } = useMemo(() => {
    const reels = [...(data?.reels ?? [])];
    reels.sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return {
      rows: reels,
      maxWatch: Math.max(1, ...reels.map((r) => r.avg_watch_time ?? 0)),
      maxSkip: Math.max(1, ...reels.map((r) => r.skip_rate ?? 0)),
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
    <AnimatedCard className="p-5" delay={0.1}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">
            Reel-by-Reel Retention
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Sort any column to find your strongest hooks and biggest skips.
          </p>
        </div>
        <span className="text-[11px] text-slate-400">{rows.length} reels</span>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-slate-400 py-12 text-center">
          No Reels in this window. Run a sync to populate.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-3 px-2 py-2 border-b border-slate-100">
            {COLUMNS.map((c) => (
              <div
                key={c.key}
                className={`${c.width} text-[10px] uppercase tracking-wider font-semibold text-slate-500`}
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

          <div className="max-h-[420px] overflow-y-auto">
            {rows.map((r, i) => (
              <motion.button
                key={r.ig_media_id}
                layout
                initial={{ opacity: 0, y: 6, filter: "blur(2px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{
                  type: "spring",
                  duration: 0.35,
                  bounce: 0,
                  delay: Math.min(i * 0.02, 0.3),
                }}
                onClick={() => onSelect?.(adaptForDrawer(r))}
                className="w-full flex items-center gap-3 px-2 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors text-left"
              >
                <div className="w-14 shrink-0">
                  <div
                    className="w-12 h-12 rounded-lg bg-gradient-to-br from-violet-100 to-pink-100 flex items-center justify-center text-violet-500 text-[10px] font-semibold"
                    style={{ border: "1px solid rgba(0,0,0,0.04)" }}
                  >
                    REEL
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-800 truncate">
                    {r.caption_preview || "(no caption)"}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {new Date(r.timestamp).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </div>
                <div className="w-24 shrink-0">
                  <span
                    className={`inline-block text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md border ${hookColor(
                      r.hook_strength_pct,
                    )}`}
                  >
                    {r.hook_strength_pct.toFixed(1)}%
                  </span>
                </div>
                <div className="w-28 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-slate-700">
                      {r.avg_watch_time.toFixed(1)}s
                    </span>
                    <MiniBar value={r.avg_watch_time} max={maxWatch} color="#06b6d4" />
                  </div>
                </div>
                <div className="w-24 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-slate-700">
                      {r.skip_rate.toFixed(1)}%
                    </span>
                    <MiniBar value={r.skip_rate} max={maxSkip} color="#ec4899" />
                  </div>
                </div>
                <div className="w-20 shrink-0">
                  <span className="font-mono text-[11px] text-slate-700">
                    {r.estimated_replay_rate.toFixed(2)}%
                  </span>
                </div>
              </motion.button>
            ))}
          </div>
        </>
      )}
    </AnimatedCard>
  );
}
