import { useEffect, type ReactNode } from "react";
import { motion, useSpring, useTransform } from "framer-motion";

// Dashboard card enter: materialize with blur + lift, spring with no bounce.
// (Landing pages use the scroll-triggered <Reveal>; this fires on mount.)
export function AnimatedCard({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ type: "spring", duration: 0.45, bounce: 0, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Count-up number. Pass a formatter to keep units/precision (defaults to
// rounded locale string). Re-animates whenever `value` changes.
export function AnimatedNumber({
  value,
  format,
}: {
  value: number;
  format?: (v: number) => string;
}) {
  const spring = useSpring(0, { duration: 800, bounce: 0 });
  const display = useTransform(spring, (v) =>
    format ? format(v) : Math.round(v).toLocaleString(),
  );
  useEffect(() => {
    spring.set(value);
  }, [value, spring]);
  return <motion.span>{display}</motion.span>;
}
