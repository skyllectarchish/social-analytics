import { useEffect, useRef } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import { TrendingUp, TrendingDown, Minus, Sparkles } from "lucide-react";
import { pctDelta, unwrapComparison } from "../../utils/stats";

function AnimatedNumber({ value, decimals = 0, suffix = "" }) {
  const spring = useSpring(0, { duration: 800, bounce: 0 });
  const display = useTransform(spring, (v) => `${v.toFixed(decimals)}${suffix}`);
  const ref = useRef(null);

  useEffect(() => {
    spring.set(value);
  }, [value, spring]);

  return <motion.span ref={ref}>{display}</motion.span>;
}

export default function ComparisonMetricPill({
  label,
  data,
  decimals = 0,
  suffix = "",
}) {
  const { current, prior, deltaPct: rawDelta, significant } = unwrapComparison(data);
  const deltaPct = rawDelta ?? pctDelta(current, prior);
  const hasCompare = prior != null;

  const deltaColor = !hasCompare
    ? "text-slate-500"
    : deltaPct == null
      ? "text-slate-500"
      : deltaPct > 0
        ? "text-emerald-600"
        : deltaPct < 0
          ? "text-rose-500"
          : "text-slate-500";

  const DeltaIcon = !hasCompare
    ? Minus
    : deltaPct == null
      ? Minus
      : deltaPct > 0
        ? TrendingUp
        : deltaPct < 0
          ? TrendingDown
          : Minus;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
        {label}
      </span>
      <span className="metric-value text-2xl">
        <AnimatedNumber value={current} decimals={decimals} suffix={suffix} />
      </span>
      {hasCompare && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`flex items-center gap-1 text-xs font-medium ${deltaColor}`}>
            <DeltaIcon size={12} />
            {deltaPct == null
              ? "—"
              : isFinite(deltaPct)
                ? `${Math.abs(deltaPct).toFixed(1)}%`
                : "—"}
          </span>
          <span className="text-[10px] text-slate-500">
            from {Number(prior).toFixed(decimals)}
            {suffix}
          </span>
          {significant && (
            <span className="flex items-center gap-0.5 text-[10px] text-violet-600 font-semibold">
              <Sparkles size={10} /> sig.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
