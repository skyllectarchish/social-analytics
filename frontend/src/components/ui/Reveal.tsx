import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { fadeUp, stagger, viewportOnce } from "../../lib/motion";

export function Reveal({
  children,
  className,
  group = false,
}: {
  children: ReactNode;
  className?: string;
  group?: boolean;
}) {
  return (
    <motion.div
      className={className}
      variants={group ? stagger : fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={viewportOnce}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div className={className} variants={fadeUp}>
      {children}
    </motion.div>
  );
}
