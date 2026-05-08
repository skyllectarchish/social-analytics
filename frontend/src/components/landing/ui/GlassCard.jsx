import { forwardRef, useRef } from "react";
import { motion } from "framer-motion";

/**
 * GlassCard
 * Translucent glass surface with optional 3-D tilt on hover and a glowing border.
 */
const GlassCard = forwardRef(function GlassCard(
  {
    children,
    className = "",
    glow = true,
    tilt = true,
    hoverLift = true,
    as: Tag = motion.div,
    ...rest
  },
  forwardedRef
) {
  const innerRef = useRef(null);
  const ref = forwardedRef || innerRef;

  const handleMove = (e) => {
    if (!tilt) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.transform = `perspective(1000px) rotateX(${(-py * 6).toFixed(2)}deg) rotateY(${(px * 8).toFixed(2)}deg) translateY(${hoverLift ? -4 : 0}px)`;
  };
  const handleLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = "perspective(1000px) rotateX(0) rotateY(0) translateY(0)";
  };

  return (
    <Tag
      ref={ref}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      className={`tilt-card relative rounded-2xl glass ${glow ? "glow-border" : ""} ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
});

export default GlassCard;
