import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Bookmark, Share2, Image as ImageIcon, Film, Gauge } from "lucide-react";
import SectionCard from "../shared/SectionCard";
import AnimatedCounter from "../landing/ui/AnimatedCounter";
import MediaThumb from "../shared/MediaThumb";
import { SkeletonChart } from "../shared/Skeleton";
import { useAlgorithmMetrics } from "../../hooks/useTier1Insights";

// Composite gauge score in 0-10 range. Algorithm rates are 0-100 percent;
// we treat 10% save_rate + share_rate as "ceiling" (rare, viral-tier).
function gaugeScore(summary) {
  if (!summary) return 0;
  const composite =
    (summary.account_save_rate ?? 0) * 0.6 +
    (summary.account_share_rate ?? 0) * 0.4;
  return Math.min(10, composite);
}

function gaugeColor(score) {
  if (score >= 7) return "#10b981";
  if (score >= 4) return "#f59e0b";
  return "#f43f5e";
}

function RadialGauge({ score }) {
  const [draw, setDraw] = useState(0);
  const max = 10;
  const radius = 64;
  const circ = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(1, score / max));

  useEffect(() => {
    const t = requestAnimationFrame(() => setDraw(pct));
    return () => cancelAnimationFrame(t);
  }, [pct]);

  const color = gaugeColor(score);

  return (
    <div className="relative w-[180px] h-[180px] mx-auto">
      <svg width="180" height="180" viewBox="0 0 180 180" className="-rotate-90">
        <defs>
          <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.55" />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
          <filter id="gaugeGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor={color} floodOpacity="0.55" />
          </filter>
        </defs>
        <circle
          cx="90"
          cy="90"
          r={radius}
          stroke="rgba(15,23,42,0.06)"
          strokeWidth="14"
          fill="none"
        />
        <motion.circle
          cx="90"
          cy="90"
          r={radius}
          stroke="url(#gaugeGrad)"
          strokeWidth="14"
          fill="none"
          strokeLinecap="round"
          filter="url(#gaugeGlow)"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ * (1 - draw) }}
          transition={{ type: "spring", duration: 1.1, bounce: 0 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          className="metric-value text-4xl"
          style={{ color }}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, type: "spring", duration: 0.4, bounce: 0 }}
        >
          <AnimatedCounter value={score} decimals={1} duration={1300} />
        </motion.span>
        <span className="text-[10px] uppercase tracking-wider text-slate-400 mt-0.5">
          algo score / 10
        </span>
      </div>
    </div>
  );
}

function TypeBadge({ productType }) {
  const isReel = productType === "REELS";
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
      style={{
        background: isReel ? "rgba(236,72,153,0.10)" : "rgba(59,130,246,0.10)",
        color: isReel ? "#db2777" : "#2563eb",
      }}
    >
      {isReel ? <Film size={9} /> : <ImageIcon size={9} />}
      {isReel ? "Reel" : "Post"}
    </span>
  );
}

function PostMiniRow({ post, index, onSelect }) {
  return (
    <motion.button
      initial={{ opacity: 0, x: -6, filter: "blur(3px)" }}
      animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
      transition={{ type: "spring", duration: 0.4, bounce: 0, delay: index * 0.05 }}
      onClick={() => onSelect?.(post)}
      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors text-left"
    >
      <MediaThumb
        mediaId={post.ig_media_id}
        alt=""
        className="w-10 h-10 rounded-lg object-cover shrink-0"
        style={{ border: "1px solid rgba(0,0,0,0.06)" }}
        fallback={<div className="w-10 h-10 rounded-lg bg-slate-100 shrink-0" />}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <TypeBadge productType={post.media_product_type} />
          <p className="text-xs text-slate-800 truncate">
            {post.caption || "(no caption)"}
          </p>
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
          <span className="flex items-center gap-0.5">
            <Bookmark size={9} /> {(post.save_rate ?? 0).toFixed(1)}%
          </span>
          <span className="flex items-center gap-0.5">
            <Share2 size={9} /> {(post.share_rate ?? 0).toFixed(1)}%
          </span>
        </div>
      </div>
      <div
        className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md shrink-0"
        style={{
          background: "rgba(139,92,246,0.10)",
          color: "#7c3aed",
        }}
      >
        {(post.algorithm_score ?? 0).toFixed(1)}
      </div>
    </motion.button>
  );
}

export default function AlgorithmScorePanel({ onSelectPost }) {
  const { data, loading, error } = useAlgorithmMetrics();

  if (loading) return <SkeletonChart height="h-[460px]" />;
  if (error)
    return (
      <SectionCard icon={Gauge} title="Algorithm Score">
        <p className="text-xs text-rose-500">{error}</p>
      </SectionCard>
    );

  const score = gaugeScore(data?.summary);
  const allPosts = data?.posts ?? [];
  const topFeed = allPosts.filter((p) => p.media_product_type === "FEED").slice(0, 3);
  const topReels = allPosts.filter((p) => p.media_product_type === "REELS").slice(0, 3);

  return (
    <SectionCard
      icon={Gauge}
      title="Algorithm Score"
      subtitle="Saves + shares — what Instagram's recommender weights"
      delay={0.05}
    >
      <RadialGauge score={score} />

      <div className="grid grid-cols-2 gap-2.5 mt-3 mb-4">
        <div className="rounded-xl p-3 bg-gradient-to-br from-violet-50 to-white border border-violet-100 shadow-[0_10px_24px_-14px_rgba(124,58,237,0.5)]">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: "#7c3aed", boxShadow: "0 0 6px rgba(124,58,237,0.7)" }}
            />
            Save Rate
          </p>
          <p className="metric-value text-[17px] text-slate-900 mt-1">
            <AnimatedCounter
              value={data?.summary?.account_save_rate ?? 0}
              decimals={2}
              suffix="%"
              duration={1300}
            />
          </p>
        </div>
        <div className="rounded-xl p-3 bg-gradient-to-br from-pink-50 to-white border border-pink-100 shadow-[0_10px_24px_-14px_rgba(236,72,153,0.5)]">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: "#ec4899", boxShadow: "0 0 6px rgba(236,72,153,0.7)" }}
            />
            Share Rate
          </p>
          <p className="metric-value text-[17px] text-slate-900 mt-1">
            <AnimatedCounter
              value={data?.summary?.account_share_rate ?? 0}
              decimals={2}
              suffix="%"
              duration={1300}
            />
          </p>
        </div>
      </div>

      <div className="border-t border-slate-100 pt-4 space-y-4">
        {topFeed.length === 0 && topReels.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">
            No posts yet — run a sync.
          </p>
        ) : (
          <>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1">
                <ImageIcon size={10} /> Top Posts
              </p>
              <div className="space-y-1">
                {topFeed.length === 0 ? (
                  <p className="text-[11px] text-slate-400 px-2 py-2">
                    No feed posts in this range.
                  </p>
                ) : (
                  topFeed.map((p, i) => (
                    <PostMiniRow
                      key={p.ig_media_id}
                      post={p}
                      index={i}
                      onSelect={onSelectPost}
                    />
                  ))
                )}
              </div>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1">
                <Film size={10} /> Top Reels
              </p>
              <div className="space-y-1">
                {topReels.length === 0 ? (
                  <p className="text-[11px] text-slate-400 px-2 py-2">
                    No reels in this range.
                  </p>
                ) : (
                  topReels.map((p, i) => (
                    <PostMiniRow
                      key={p.ig_media_id}
                      post={p}
                      index={i}
                      onSelect={onSelectPost}
                    />
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </SectionCard>
  );
}
