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
import PeriodSelector from "../dashboard/PeriodSelector";
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
            {d.interaction_per_follow_ratio.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function SpikeTimeline({ days: initialDays = 90, onDaysChange }) {
  const [days, setDays] = useState(initialDays);
  const [selected, setSelected] = useState(null);
  const { data, loading, error } = useFollowerSpikes(days, 50);

  const handleDays = (d) => {
    setDays(d);
    onDaysChange?.(d);
  };

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
          <PeriodSelector days={days} onChange={handleDays} />
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
                  onClick={(p) => p?.is_suspicious && setSelected(p)}
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
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center shrink-0">
                    <AlertTriangle size={16} color="#be123c" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-800">
                      Advisory: {fmtDate(selected.spike_date)}
                    </p>
                    <p className="text-xs text-slate-500 mt-1 max-w-xl">
                      This spike gained{" "}
                      <strong>{selected.follows_change.toLocaleString()}</strong>{" "}
                      followers but only{" "}
                      <strong>{selected.interactions.toLocaleString()}</strong>{" "}
                      interactions — a ratio of{" "}
                      <strong>
                        {selected.interaction_per_follow_ratio.toFixed(2)}
                      </strong>
                      . Healthy organic growth typically lands above 1.0. This
                      pattern is consistent with bot follows or paid growth
                      services — check your reach in the following week and
                      consider blocking inactive accounts.
                    </p>
                  </div>
                  <button
                    onClick={() => setSelected(null)}
                    className="text-[11px] text-slate-400 hover:text-slate-600 px-2 py-1 rounded-md hover:bg-slate-50 shrink-0"
                  >
                    Dismiss
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatedCard>
  );
}
