import { Loader2 } from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { motion } from "framer-motion";
import type { RetentionAnnotation, RetentionCurvePoint } from "../../api/youtubeTypes";
import GlassTooltip from "../charts/GlassTooltip";
import { PALETTE } from "../../data/mock";

function fmtTimestamp(elapsed: number, durationSeconds: number) {
  const s = Math.round(elapsed * durationSeconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function SmartRetentionChart({
  curve,
  annotations,
  annotationsPending,
  durationSeconds,
}: {
  curve: RetentionCurvePoint[];
  annotations: RetentionAnnotation[];
  annotationsPending: boolean;
  durationSeconds: number;
}) {
  if (!curve.length) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-center text-sm text-foreground/50">
        <p>No retention data available for this video.</p>
        <p className="text-xs text-foreground/35 max-w-xs">
          YouTube Analytics only provides retention curves once a video reaches a minimum view threshold. Try a higher-view video.
        </p>
      </div>
    );
  }

  const chartData = curve.map((p) => ({
    elapsed: p.elapsed_ratio,
    watch: p.watch_ratio * 100,
    benchmark: p.relative_performance * 100,
  }));

  const cliffElapsed = annotations.map((a) => ({
    elapsed: durationSeconds > 0 ? a.timestamp_seconds / durationSeconds : 0,
  }));

  return (
    <div
      role="img"
      aria-label={`Retention curve. ${annotations.length} drop-off${annotations.length !== 1 ? "s" : ""} annotated.`}
    >
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 6, bottom: 0, left: -14 }}>
            <defs>
              <linearGradient id="retentionFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={PALETTE.violet} stopOpacity={0.35} />
                <stop offset="100%" stopColor={PALETTE.violet} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={PALETTE.grid} vertical={false} />
            <XAxis
              dataKey="elapsed"
              tickFormatter={(v) => fmtTimestamp(v, durationSeconds)}
              tick={{ fontSize: 10, fill: PALETTE.muted }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={28}
            />
            <YAxis
              tickFormatter={(v) => `${Math.round(v as number)}%`}
              tick={{ fontSize: 10, fill: PALETTE.muted }}
              tickLine={false}
              axisLine={false}
              width={40}
              domain={[0, 100]}
            />
            <Tooltip content={<GlassTooltip />} formatter={(v: number) => [`${v.toFixed(1)}%`]} />
            <Area
              type="monotone"
              dataKey="watch"
              name="Retention"
              stroke={PALETTE.primary}
              fill="url(#retentionFill)"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, fill: PALETTE.primary, strokeWidth: 0 }}
            />
            <Line
              type="monotone"
              dataKey="benchmark"
              name="YT Average"
              stroke={PALETTE.muted}
              strokeDasharray="5 5"
              strokeWidth={1.5}
              dot={false}
            />
            {cliffElapsed.map(({ elapsed }, idx) => (
              <ReferenceLine
                key={idx}
                x={elapsed}
                stroke={PALETTE.violet}
                strokeDasharray="4 4"
                strokeWidth={1.5}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {annotations.length > 0 && (
        <div className="mt-4 space-y-2">
          {annotations.map((a, i) => {
            const s = a.timestamp_seconds;
            const mm = Math.floor(s / 60);
            const ss = s % 60;
            return (
              <motion.div
                key={a.timestamp_seconds}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: i * 0.05, ease: "easeOut" }}
                className="glass rounded-xl border border-violet/15 p-3"
              >
                <div className="flex items-center gap-2">
                  <span className="chip !bg-lavender/60 !text-violet-deep !text-[10px]">
                    {mm}:{ss.toString().padStart(2, "0")}
                  </span>
                  <span className="chip !bg-lavender/60 !text-violet-deep !text-[10px]">
                    &minus;{a.drop_pct.toFixed(1)}% viewers
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-foreground/75">{a.annotation_text}</p>
              </motion.div>
            );
          })}
        </div>
      )}

      {annotationsPending && (
        <div className="mt-3 flex items-center gap-2 text-xs text-foreground/50">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Analyzing with AI — check back in a moment…
        </div>
      )}
    </div>
  );
}
