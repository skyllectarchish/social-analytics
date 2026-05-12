import { useEffect, useRef } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

function AnimatedNumber({ value, decimals = 0, suffix = "" }) {
  const spring = useSpring(0, { duration: 800, bounce: 0 });
  const display = useTransform(spring, (v) => `${v.toFixed(decimals)}${suffix}`);
  const ref = useRef(null);

  useEffect(() => {
    spring.set(value);
  }, [value, spring]);

  return <motion.span ref={ref}>{display}</motion.span>;
}

export default function MetricPill({
  label,
  value,
  delta,
  suffix = "",
  decimals = 0,
}) {
  const deltaColor =
    delta > 0 ? "text-emerald-600" : delta < 0 ? "text-rose-500" : "text-slate-400";
  const DeltaIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
        {label}
      </span>
      <span className="metric-value text-2xl">
        <AnimatedNumber value={value} decimals={decimals} suffix={suffix} />
      </span>
      {delta !== undefined && (
        <span className={`flex items-center gap-1 text-xs font-medium ${deltaColor}`}>
          <DeltaIcon size={12} />
          {Math.abs(delta).toFixed(1)}%
        </span>
      )}
    </div>
  );
}
