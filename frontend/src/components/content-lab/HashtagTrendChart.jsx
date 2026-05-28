import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { Hash, ArrowLeft } from "lucide-react";
import SectionCard from "../shared/SectionCard";
import { useHashtagTrend } from "../../hooks/useHashtags";

function fmtWeek(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const eng = payload.find((p) => p.dataKey === "avg_engagement_rate_pct")?.value;
  const posts = payload[0]?.payload?.posts_used;
  return (
    <div
      className="glass-strong rounded-xl p-3"
      style={{ minWidth: 160, boxShadow: "0 8px 24px rgba(15,23,42,0.10)" }}
    >
      <p className="text-xs font-semibold text-slate-900 mb-1">
        Week of {fmtWeek(label)}
      </p>
      <p className="text-[11px] text-slate-500 mb-2">{posts ?? 0} posts</p>
      <div className="flex items-center justify-between gap-4 text-[11px]">
        <span className="flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: "#7c3aed" }}
          />
          Engagement
        </span>
        <span className="font-mono font-semibold text-slate-800">
          {(eng ?? 0).toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

export default function HashtagTrendChart({ tag }) {
  const { data, loading, error } = useHashtagTrend(tag);
  const series = (data?.data ?? []).map((d) => ({
    ...d,
    label: fmtWeek(d.week_start),
  }));

  return (
    <SectionCard
      icon={Hash}
      title={tag ? `#${tag}` : "Select a hashtag"}
      subtitle={
        tag ? "Engagement rate per week" : "Click a row on the left to see its trend."
      }
      delay={0.1}
      className="min-h-[280px]"
    >
      <AnimatePresence mode="wait">
        {!tag ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-[220px] flex flex-col items-center justify-center gap-2 text-slate-300"
          >
            <ArrowLeft size={20} className="text-slate-300" />
            <p className="text-xs">pick a hashtag</p>
          </motion.div>
        ) : loading ? (
          <div className="h-[220px] rounded-lg shimmer-line bg-slate-50" />
        ) : error ? (
          <p className="text-xs text-rose-500 py-10 text-center">{error}</p>
        ) : series.length === 0 ? (
          <p className="text-xs text-slate-400 py-12 text-center">
            Not enough history for #{tag} yet.
          </p>
        ) : (
          <motion.div
            key={tag}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", duration: 0.35, bounce: 0 }}
          >
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart
                data={series}
                margin={{ left: 0, right: 12, top: 8, bottom: 8 }}
              >
                <defs>
                  <linearGradient id="tagTrendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(15,23,42,0.06)"
                />
                <XAxis
                  dataKey="label"
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: "rgba(15,23,42,0.08)" }}
                />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={11}
                  tickFormatter={(v) => `${v.toFixed(1)}%`}
                  tickLine={false}
                  axisLine={false}
                  width={42}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="avg_engagement_rate_pct"
                  stroke="#7c3aed"
                  fill="url(#tagTrendGrad)"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{
                    r: 5,
                    strokeWidth: 2,
                    fill: "#7c3aed",
                    stroke: "#fff",
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>
        )}
      </AnimatePresence>
    </SectionCard>
  );
}
