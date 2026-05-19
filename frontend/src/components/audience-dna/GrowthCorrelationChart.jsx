import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity } from "lucide-react";
import AnimatedCard from "../shared/AnimatedCard";
import { SkeletonChart } from "../shared/Skeleton";
import { useGrowthCorrelation } from "../../hooks/useGrowthDrivers";

function fmtNum(v) {
  if (v == null) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(Math.round(v));
}

//: Reading the |r| value: <0.2 effectively none, 0.2-0.4 weak, 0.4-0.7
//: moderate, >0.7 strong. We surface a one-word label rather than the raw
//: number alone so a creator who doesn't read stats still gets the answer.
function interpretR(r) {
  if (r == null) return { label: "Not enough data", tone: "text-slate-400" };
  const abs = Math.abs(r);
  if (abs < 0.2) return { label: "Effectively none", tone: "text-slate-500" };
  if (abs < 0.4) return { label: r > 0 ? "Weakly positive" : "Weakly negative", tone: "text-slate-600" };
  if (abs < 0.7) return { label: r > 0 ? "Moderately positive" : "Moderately negative", tone: r > 0 ? "text-emerald-600" : "text-rose-500" };
  return { label: r > 0 ? "Strongly positive" : "Strongly negative", tone: r > 0 ? "text-emerald-700 font-semibold" : "text-rose-600 font-semibold" };
}

export default function GrowthCorrelationChart() {
  const { data, loading, error } = useGrowthCorrelation();

  if (loading) return <SkeletonChart height="h-[320px]" />;
  if (error) {
    return (
      <AnimatedCard className="p-5">
        <p className="text-xs text-rose-500">{error}</p>
      </AnimatedCard>
    );
  }

  const points = data?.points ?? [];
  const r = data?.correlation;
  const interpretation = interpretR(r);
  const usesNFR = data?.uses_non_follower_reach;

  return (
    <AnimatedCard className="p-5" delay={0.08}>
      <div className="flex items-start gap-2 mb-3">
        <Activity size={14} className="text-violet-500 mt-0.5 shrink-0" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-slate-800">
            Does reach drive follower growth?
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Each dot is one day. X = same-day {usesNFR ? "non-follower reach" : "reach"},
            Y = net new follows.
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-xs font-mono ${interpretation.tone}`}>
            {r == null ? "—" : `r = ${r.toFixed(2)}`}
          </p>
          <p className={`text-[10px] ${interpretation.tone}`}>
            {interpretation.label}
          </p>
        </div>
      </div>

      {points.length < 3 ? (
        <p className="text-xs text-slate-400 py-12 text-center">
          Need at least 3 days of follower data to compute correlation.
        </p>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(15,23,42,0.06)"
              />
              <XAxis
                type="number"
                dataKey="reach"
                stroke="#94a3b8"
                fontSize={11}
                tickLine={false}
                tickFormatter={fmtNum}
                axisLine={{ stroke: "rgba(15,23,42,0.08)" }}
                name="Reach"
              />
              <YAxis
                type="number"
                dataKey="follows"
                stroke="#94a3b8"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={42}
                name="Follows"
              />
              <Tooltip
                cursor={{ stroke: "rgba(139,92,246,0.4)", strokeWidth: 1 }}
                contentStyle={{
                  background: "rgba(255,255,255,0.98)",
                  border: "1px solid rgba(0,0,0,0.08)",
                  borderRadius: 12,
                  fontSize: 11,
                }}
                formatter={(v, name) => [
                  name === "reach" ? fmtNum(v) : Number(v).toLocaleString(),
                  name === "reach" ? "Reach" : "Follows",
                ]}
                labelFormatter={(_, items) => items?.[0]?.payload?.day ?? ""}
              />
              <Scatter
                data={points}
                fill="#8b5cf6"
                fillOpacity={0.65}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}

      {!usesNFR && points.length >= 3 && (
        <p className="text-[10px] text-slate-400 mt-3 leading-relaxed">
          Non-follower reach hasn&apos;t synced yet — using total reach as a
          rough proxy. Numbers will sharpen once Meta&apos;s per-post breakdown
          backfills.
        </p>
      )}
    </AnimatedCard>
  );
}
