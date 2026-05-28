import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  CartesianGrid,
} from "recharts";
import { motion } from "framer-motion";
import { Layers } from "lucide-react";
import MediaThumb from "../shared/MediaThumb";
import DrillDownChart from "../shared/DrillDownChart";
import { SkeletonChart } from "../shared/Skeleton";
import { AXIS_TICK, GRID_STROKE } from "../shared/chart";
import {
  useFormatBreakdown,
  useFormatBreakdownPosts,
} from "../../hooks/useTier1Insights";

const FORMAT_COLORS = {
  REELS: "#7c3aed",
  FEED: "#ec4899",
  STORY: "#f59e0b",
};

const FORMAT_GRAD = {
  REELS: "url(#fmtReels)",
  FEED: "url(#fmtFeed)",
  STORY: "url(#fmtStory)",
};

const FORMAT_BG = {
  REELS: "card-lavender",
  FEED: "card-pink",
  STORY: "card-peach",
};

function labelForRow(r) {
  const mt = r.media_type === "CAROUSEL_ALBUM" ? "CAROUSEL" : r.media_type;
  return `${r.media_product_type} · ${mt}`;
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div
      className="glass-strong rounded-xl p-3"
      style={{ minWidth: 200, boxShadow: "0 8px 24px rgba(15,23,42,0.10)" }}
    >
      <p className="text-xs font-semibold text-slate-900">{labelForRow(d)}</p>
      <p className="text-[11px] text-slate-500 mb-2">{d.post_count} posts</p>
      <div className="h-px bg-slate-100 my-1.5" />
      <div className="flex items-center justify-between text-[11px] py-0.5">
        <span className="text-slate-500">Engagement</span>
        <span className="font-mono font-semibold text-slate-800">
          {d.avg_engagement_rate.toFixed(2)}%
        </span>
      </div>
      <div className="flex items-center justify-between text-[11px] py-0.5">
        <span className="text-slate-500">Save Rate</span>
        <span className="font-mono font-semibold text-slate-800">
          {d.avg_save_rate.toFixed(2)}%
        </span>
      </div>
      <div className="flex items-center justify-between text-[11px] py-0.5">
        <span className="text-slate-500">Share Rate</span>
        <span className="font-mono font-semibold text-slate-800">
          {d.avg_share_rate.toFixed(2)}%
        </span>
      </div>
      <div className="h-px bg-slate-100 my-1.5" />
      <p className="text-[10px] text-violet-600 font-medium">
        Click to explore →
      </p>
    </div>
  );
}

function FormatPostRow({ post, index, onSelect }) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 6, filter: "blur(3px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ type: "spring", duration: 0.35, bounce: 0, delay: index * 0.04 }}
      onClick={() => onSelect?.(post)}
      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors text-left"
    >
      <MediaThumb
        mediaId={post.ig_media_id}
        alt=""
        className="w-12 h-12 rounded-lg object-cover shrink-0"
        style={{ border: "1px solid rgba(0,0,0,0.06)" }}
        fallback={<div className="w-12 h-12 rounded-lg bg-slate-100 shrink-0" />}
      />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-800 truncate">
          {post.caption_preview || "(no caption)"}
        </p>
        <p className="text-[10px] text-slate-400 mt-0.5">
          {new Date(post.timestamp).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}{" "}
          · reach {Math.round(post.reach).toLocaleString()}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs font-semibold font-mono text-violet-700">
          {post.algorithm_score_pct.toFixed(1)}
        </p>
        <p className="text-[10px] text-slate-400">score</p>
      </div>
    </motion.button>
  );
}

export default function FormatBreakdownChart({ onSelectPost }) {
  const { data, loading, error } = useFormatBreakdown();

  return (
    <DrillDownChart
      icon={Layers}
      title="Format Breakdown"
      subtitle="Which content types earn the most engagement"
      levels={["By Format", "Top Posts"]}
    >
      {(state, onDrill) => {
        if (state.level === 0) {
          if (loading) return <SkeletonChart height="h-48" />;
          if (error)
            return <p className="text-xs text-rose-500 py-8">{error}</p>;
          const rows = (data?.data ?? []).map((r) => ({ ...r, label: labelForRow(r) }));
          if (!rows.length)
            return (
              <p className="text-xs text-slate-400 py-12 text-center">
                Not enough data yet. Run a sync to populate.
              </p>
            );
          return (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={rows}
                  barSize={20}
                  margin={{ left: 8, right: 28, top: 4, bottom: 4 }}
                >
                  <defs>
                    <linearGradient id="fmtReels" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#7c3aed" />
                      <stop offset="100%" stopColor="#c084fc" />
                    </linearGradient>
                    <linearGradient id="fmtFeed" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#ec4899" />
                      <stop offset="100%" stopColor="#f9a8d4" />
                    </linearGradient>
                    <linearGradient id="fmtStory" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#f59e0b" />
                      <stop offset="100%" stopColor="#fcd34d" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid horizontal={false} stroke={GRID_STROKE} />
                  <XAxis
                    type="number"
                    domain={[0, "auto"]}
                    tickFormatter={(v) => `${v.toFixed(1)}%`}
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={140}
                    tick={{ ...AXIS_TICK, fill: "#475569" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={<CustomTooltip />}
                    cursor={{ fill: "rgba(124,58,237,0.05)" }}
                  />
                  <Bar
                    dataKey="avg_engagement_rate"
                    radius={[0, 5, 5, 0]}
                    cursor="pointer"
                    onClick={(payload) => onDrill(payload?.media_product_type)}
                  >
                    {rows.map((r, i) => (
                      <Cell
                        key={i}
                        fill={FORMAT_GRAD[r.media_product_type] ?? "#cbd5e1"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          );
        }

        return (
          <FormatPostsDrill
            format={state.context}
            onSelectPost={onSelectPost}
          />
        );
      }}
    </DrillDownChart>
  );
}

function FormatPostsDrill({ format, onSelectPost }) {
  const { data, loading, error } = useFormatBreakdownPosts(format);
  if (loading) return <SkeletonChart height="h-48" />;
  if (error) return <p className="text-xs text-rose-500 py-8">{error}</p>;
  const posts = data?.posts ?? [];
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span
          className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${FORMAT_BG[format] ?? "bg-slate-100"}`}
        >
          {format}
        </span>
        <span className="text-[11px] text-slate-500">
          Top {posts.length} posts by algorithm score
        </span>
      </div>
      <div className="space-y-1 max-h-[260px] overflow-y-auto pr-1">
        {posts.length === 0 ? (
          <p className="text-xs text-slate-400 py-8 text-center">
            No posts for this format.
          </p>
        ) : (
          posts.map((p, i) => (
            <FormatPostRow
              key={p.ig_media_id}
              post={p}
              index={i}
              onSelect={onSelectPost}
            />
          ))
        )}
      </div>
    </div>
  );
}
