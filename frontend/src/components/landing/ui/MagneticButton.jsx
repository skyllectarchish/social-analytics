import { useRef } from "react";
import { motion } from "framer-motion";

/**
 * MagneticButton — pill button that follows the cursor on hover and emits a soft glow.
 *
 * variant:
 *  - "primary" : dark slate fill (Linear-style high-contrast CTA)
 *  - "gradient": vibrant gradient fill (hero CTA)
 *  - "ghost"   : white glass outline
 */
export default function MagneticButton({
  children,
  variant = "primary",
  className = "",
  as: Tag = "button",
  ...rest
}) {
  const ref = useRef(null);

  const onMove = (e) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    el.style.setProperty("--mx", `${x * 0.22}px`);
    el.style.setProperty("--my", `${y * 0.22}px`);
  };
  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--mx", "0px");
    el.style.setProperty("--my", "0px");
  };

  const base =
    "btn-magnetic group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full px-6 py-3 text-sm font-semibold tracking-tight will-change-transform";

  let styles = "";
  if (variant === "primary") {
    styles =
      "bg-[#0a0e27] text-white shadow-[0_10px_28px_-14px_rgba(10,14,39,0.7)] hover:bg-slate-800";
  } else if (variant === "gradient") {
    styles = "btn-primary-glow";
  } else {
    styles = "glass text-[#0a0e27] hover:bg-white/90";
  }

  return (
    <motion.span
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      whileTap={{ scale: 0.96 }}
      style={{
        transform: "translate3d(var(--mx, 0), var(--my, 0), 0)",
        transition: "transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)",
        display: "inline-block",
      }}
    >
      <Tag className={`${base} ${styles} ${className}`} {...rest}>
        {children}
      </Tag>
    </motion.span>
  );
}
