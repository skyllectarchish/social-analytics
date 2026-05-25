import { useMemo, useState } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import AnimatedCard from "../shared/AnimatedCard";
import { SkeletonChart } from "../shared/Skeleton";
import { useFollowerSpikes } from "../../hooks/useTier1Insights";

function fmtDate(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div
      className="glass-strong rounded-xl p-3"
      style={{ minWidth: 200, boxShadow: "0 8px 24px rgba(15,23,42,0.10)" }}
    >
      <div className="flex items-center gap-2 mb-1">
        <p className="text-xs font-semibold text-slate-900">
          {fmtDate(d.spike_date)}
        </p>
        {d.is_suspicious && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded-md">
            <AlertTriangle size={9} /> SUSPICIOUS
          </span>
        )}
      </div>
      <div className="space-y-0.5 text-[11px]">
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-500">Follows change</span>
          <span className="font-mono font-semibold text-slate-800">
            +{d.follows_change.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-500">Interactions</span>
          <span className="font-mono font-semibold text-slate-800">
            {d.interactions.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-100 mt-1">
          <span className="text-slate-500">Interaction / Follow</span>
          <span className="font-mono font-semibold text-slate-800">
            {(d.interaction_per_follow_ratio ?? 0).toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}

function SpikeDetailPanel({ spike, onClose, onSelectPost }) {
  const drivers = spike.candidate_drivers ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
            spike.is_suspicious
              ? "bg-rose-50 border border-rose-200"
              : "bg-violet-50 border border-violet-200"
          }`}
        >
          {spike.is_suspicious ? (
            <AlertTriangle size={16} color="#be123c" />
          ) : (
            <span className="text-violet-600 text-base">📈</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-slate-800">
              {fmtDate(spike.spike_date)} · +
              {spike.follows_change.toLocaleString()} followers
            </p>
            {spike.is_suspicious && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded-md">
                <AlertTriangle size={9} /> SUSPICIOUS
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {spike.interactions.toLocaleString()} interactions · ratio{" "}
            {spike.interaction_per_follow_ratio.toFixed(2)}
            {spike.is_suspicious &&
              " — bot/pod pattern. Healthy organic growth typically lands above 1.0."}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-[11px] text-slate-400 hover:text-slate-600 px-2 py-1 rounded-md hover:bg-slate-50 shrink-0"
        >
          Dismiss
        </button>
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">
          Candidate driver posts
        </p>
        {drivers.length === 0 ? (
          <p className="text-[11px] text-slate-400 py-2">
            No candidate drivers in the 24h window before this spike.
          </p>
        ) : (
          <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
            {drivers.map((d) => (
              <button
                key={d.ig_media_id}
                onClick={() => onSelectPost?.(d)}
                className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors text-left"
              >
                {d.thumbnail_url ? (
                  <img
                    src={d.thumbnail_url}
                    alt=""
                    className="w-9 h-9 rounded-lg object-cover shrink-0"
                    style={{ border: "1px solid rgba(0,0,0,0.06)" }}
                  />
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-slate-100 shrink-0" />
                )}
                <p className="flex-1 min-w-0 text-xs text-slate-800 truncate">
                  {d.caption || "(no caption)"}
                </p>
                <p className="text-xs font-mono font-semibold text-emerald-600 shrink-0">
                  +{Math.round(d.attributed_follows ?? 0)}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SpikeTimeline({ onSelectPost }) {
  const [selected, setSelected] = useState(null);
  const { data, loading, error } = useFollowerSpikes(50);

  const { points, maxChange } = useMemo(() => {
    const spikes = data?.spikes ?? [];
    const max = Math.max(1, ...spikes.map((s) => s.follows_change));
    const pts = spikes.map((s) => ({
      ...s,
      ts: new Date(s.spike_date).getTime(),
      size: 60 + (s.follows_change / max) * 240,
    }));
    return { points: pts, maxChange: max };
  }, [data]);

  const suspiciousCount = points.filter((p) => p.is_suspicious).length;

  return (
    <AnimatedCard className="p-5" delay={0.12}>
      <div className="flex items-start justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">
            Spike Detection Timeline
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Days with unusual follower gains. Red dots are flagged for low
            interaction-to-follow ratio.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {suspiciousCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-1 rounded-md">
              <AlertTriangle size={11} /> {suspiciousCount} suspicious
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <SkeletonChart height="h-64" />
      ) : error ? (
        <p className="text-xs text-rose-500 py-8">{error}</p>
      ) : points.length === 0 ? (
        <p className="text-xs text-slate-400 py-12 text-center">
          No spikes above threshold in this window. Your growth has been steady.
        </p>
      ) : (
        <>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ left: 0, right: 12, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.06)" />
                <XAxis
                  dataKey="ts"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  scale="time"
                  tickFormatter={(t) => fmtDate(new Date(t).toISOString())}
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: "rgba(15,23,42,0.08)" }}
                />
                <YAxis
                  dataKey="follows_change"
                  stroke="#94a3b8"
                  fontSize={11}
                  tickFormatter={(v) =>
                    v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v
                  }
                  tickLine={false}
                  axisLine={false}
                />
                <ZAxis dataKey="size" range={[60, 320]} />
                <Tooltip
                  content={<CustomTooltip />}
                  cursor={{ stroke: "rgba(139,92,246,0.2)", strokeDasharray: "3 3" }}
                />
                <Scatter
                  data={points}
                  onClick={(p) => p && setSelected(p)}
                  cursor="pointer"
                >
                  {points.map((p, i) => (
                    <Cell
                      key={i}
                      fill={p.is_suspicious ? "#f43f5e" : "#8b5cf6"}
                      fillOpacity={p.is_suspicious ? 0.75 : 0.55}
                      stroke={p.is_suspicious ? "#be123c" : "#7c3aed"}
                      strokeWidth={p.is_suspicious ? 1.5 : 1}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center gap-4 mt-3 text-[10px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: "rgba(139,92,246,0.55)", border: "1px solid #7c3aed" }}
              />
              Normal growth
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: "rgba(244,63,94,0.75)", border: "1px solid #be123c" }}
              />
              Suspicious (low interaction ratio)
            </span>
            <span className="ml-auto text-slate-300">
              dot size ∝ follows gained
            </span>
          </div>

          <AnimatePresence>
            {selected && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ type: "spring", duration: 0.4, bounce: 0 }}
                className="overflow-hidden border-t border-slate-100 mt-4 pt-4"
              >
                <SpikeDetailPanel
                  spike={selected}
                  onClose={() => setSelected(null)}
                  onSelectPost={onSelectPost}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatedCard>
  );
}
