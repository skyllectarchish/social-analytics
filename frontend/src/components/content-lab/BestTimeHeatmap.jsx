import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AnimatedCard from "../shared/AnimatedCard";
import { SkeletonChart } from "../shared/Skeleton";
import { useBestTime, useBestTimePosts } from "../../hooks/useTier1Insights";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function getColor(rate, maxRate) {
  const t = maxRate > 0 ? Math.min(1, rate / maxRate) : 0;
  if (t === 0) return "oklch(0.97 0.005 275)";
  const lightness = 0.95 - t * 0.45;
  const chroma = t * 0.22;
  return `oklch(${lightness.toFixed(3)} ${chroma.toFixed(3)} 275)`;
}

function fmtHourLabel(h) {
  if (h === 0) return "12am";
  if (h === 12) return "12pm";
  if (h < 12) return `${h}am`;
  return `${h - 12}pm`;
}

function Cell({ slot, maxRate, isSweet, onHover, onClick, isSelected }) {
  const rate = slot?.avg_engagement_rate ?? 0;
  const color = slot ? getColor(rate, maxRate) : "oklch(0.97 0.005 275 / 0.5)";

  return (
    <motion.button
      onMouseEnter={() => onHover(slot)}
      onMouseLeave={() => onHover(null)}
      onClick={() => slot && onClick(slot)}
      whileHover={slot ? { scale: 1.15, zIndex: 10 } : undefined}
      transition={{ type: "spring", duration: 0.15, bounce: 0 }}
      className={`relative rounded-[3px] ${slot ? "cursor-pointer" : "cursor-default"} ${
        isSelected ? "ring-2 ring-violet-500 ring-offset-1" : ""
      }`}
      style={{
        width: "100%",
        aspectRatio: "1 / 1",
        background: color,
        border: "1px solid rgba(15,23,42,0.04)",
      }}
    >
      {isSweet && slot && (
        <motion.span
          className="absolute inset-0 rounded-[3px]"
          style={{
            boxShadow: "0 0 0 2px rgba(139,92,246,0.6)",
            pointerEvents: "none",
          }}
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
    </motion.button>
  );
}

function CellTooltip({ slot }) {
  if (!slot) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.15 }}
      className="glass-strong rounded-lg px-3 py-2 text-xs"
      style={{ boxShadow: "0 4px 12px rgba(15,23,42,0.08)" }}
    >
      <p className="font-semibold text-slate-800">
        {DAYS[slot.day_of_week - 1]} · {fmtHourLabel(slot.hour_of_day)}
      </p>
      <p className="text-[11px] text-slate-500">
        {slot.sample_size} posts · {slot.avg_engagement_rate.toFixed(2)}% engagement
      </p>
    </motion.div>
  );
}

function SlotPostsDrawer({ slot, days, onClose }) {
  const { data, loading } = useBestTimePosts(slot?.day_of_week, slot?.hour_of_day, days);
  if (!slot) return null;
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ type: "spring", duration: 0.4, bounce: 0 }}
      className="overflow-hidden border-t border-slate-100 mt-4 pt-4"
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">
            {DAYS[slot.day_of_week - 1]} at {fmtHourLabel(slot.hour_of_day)}
          </p>
          <p className="text-[11px] text-slate-500">
            {slot.sample_size} posts · {slot.avg_engagement_rate.toFixed(2)}% avg engagement
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-[11px] text-slate-400 hover:text-slate-600 px-2 py-1 rounded-md hover:bg-slate-50"
        >
          Close
        </button>
      </div>
      {loading ? (
        <div className="h-24 rounded-lg bg-slate-50 shimmer-line" />
      ) : (data?.posts ?? []).length === 0 ? (
        <p className="text-xs text-slate-400 py-4 text-center">No posts in this slot.</p>
      ) : (
        <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
          {(data?.posts ?? []).map((p, i) => (
            <motion.a
              key={p.ig_media_id}
              href={p.permalink}
              target="_blank"
              rel="noopener noreferrer"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, type: "spring", duration: 0.3, bounce: 0 }}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors"
            >
              {p.thumbnail_url ? (
                <img
                  src={p.thumbnail_url}
                  alt=""
                  className="w-10 h-10 rounded-lg object-cover shrink-0"
                  style={{ border: "1px solid rgba(0,0,0,0.06)" }}
                />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-slate-100 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-800 truncate">
                  {p.caption_preview || "(no caption)"}
                </p>
                <p className="text-[10px] text-slate-400">
                  reach {Math.round(p.reach).toLocaleString()}
                </p>
              </div>
              <p className="text-xs font-mono font-semibold text-violet-700">
                {p.engagement_rate_pct.toFixed(2)}%
              </p>
            </motion.a>
          ))}
        </div>
      )}
    </motion.div>
  );
}

export default function BestTimeHeatmap({ days = 90 }) {
  const { data, loading, error } = useBestTime(days, 3);
  const [hovered, setHovered] = useState(null);
  const [selected, setSelected] = useState(null);

  const { lookup, maxRate, sweetSpots } = useMemo(() => {
    const slots = data?.data ?? [];
    const map = new Map();
    let max = 0;
    for (const s of slots) {
      map.set(`${s.day_of_week}-${s.hour_of_day}`, s);
      if (s.avg_engagement_rate > max) max = s.avg_engagement_rate;
    }
    const top = [...slots]
      .sort((a, b) => b.avg_engagement_rate - a.avg_engagement_rate)
      .slice(0, 3)
      .map((s) => `${s.day_of_week}-${s.hour_of_day}`);
    return { lookup: map, maxRate: max, sweetSpots: new Set(top) };
  }, [data]);

  if (loading) {
    return (
      <AnimatedCard className="p-5">
        <SkeletonChart height="h-64" />
      </AnimatedCard>
    );
  }

  return (
    <AnimatedCard className="p-5" delay={0.1}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">
            Best Time to Post
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Engagement rate by day of week × hour of day. Brighter = better.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-400">
          <span>Low</span>
          <div className="w-24 h-2 rounded-full" style={{
            background:
              "linear-gradient(90deg, oklch(0.97 0.005 275), oklch(0.78 0.11 275), oklch(0.50 0.22 275))",
          }} />
          <span>High</span>
        </div>
      </div>

      {error ? (
        <p className="text-xs text-rose-500 py-8">{error}</p>
      ) : (
        <div className="relative">
          <div className="flex flex-col gap-1">
            <div className="flex gap-1 pl-10">
              {HOURS.map((h) =>
                h % 3 === 0 ? (
                  <div
                    key={h}
                    className="flex-1 text-[10px] text-slate-400 text-center"
                    style={{ flexBasis: 0 }}
                  >
                    {fmtHourLabel(h)}
                  </div>
                ) : (
                  <div key={h} style={{ flex: 1, flexBasis: 0 }} />
                ),
              )}
            </div>

            {DAYS.map((dayLabel, di) => {
              const dayOfWeek = di + 1;
              return (
                <div key={dayLabel} className="flex items-center gap-1">
                  <div className="w-10 text-[10px] text-slate-400 font-medium text-right pr-1">
                    {dayLabel}
                  </div>
                  <div className="flex-1 flex gap-1">
                    {HOURS.map((h) => {
                      const key = `${dayOfWeek}-${h}`;
                      const slot = lookup.get(key);
                      return (
                        <div key={h} style={{ flex: 1 }}>
                          <Cell
                            slot={slot}
                            maxRate={maxRate}
                            isSweet={sweetSpots.has(key)}
                            isSelected={
                              selected &&
                              selected.day_of_week === dayOfWeek &&
                              selected.hour_of_day === h
                            }
                            onHover={setHovered}
                            onClick={(s) =>
                              setSelected(
                                selected?.day_of_week === s.day_of_week &&
                                  selected?.hour_of_day === s.hour_of_day
                                  ? null
                                  : s,
                              )
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 h-10 flex items-center">
            <AnimatePresence mode="wait">
              {hovered ? (
                <CellTooltip key="t" slot={hovered} />
              ) : (
                <motion.p
                  key="hint"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-[11px] text-slate-400"
                >
                  Hover a cell for details. Click to see posts from that slot.
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          <AnimatePresence>
            {selected && (
              <SlotPostsDrawer
                slot={selected}
                days={days}
                onClose={() => setSelected(null)}
              />
            )}
          </AnimatePresence>
        </div>
      )}
    </AnimatedCard>
  );
}
