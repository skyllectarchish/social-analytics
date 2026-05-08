import { motion } from "framer-motion";

/**
 * FloatingOrnaments — small decorative floating chips/rings/orbs scattered
 * around a section to add visual layering and density without adding content.
 *
 * Pass an array of `items`, each with:
 *   - position: { top, bottom, left, right } (Tailwind classes via inline style)
 *   - delay (s): float-animation start offset
 *   - duration (s): float-animation period
 *   - children: the chip/ornament JSX
 *   - hideBelow: optional Tailwind breakpoint class hint to hide on small screens
 */
export default function FloatingOrnaments({ items = [] }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {items.map((it, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 12, scale: 0.94 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: "-10% 0px" }}
          transition={{ duration: 0.7, delay: 0.1 + i * 0.07, ease: [0.2, 0.8, 0.2, 1] }}
          className={`absolute ${it.hideBelow || ""}`}
          style={{
            top: it.top,
            bottom: it.bottom,
            left: it.left,
            right: it.right,
            animation: `${it.size === "sm" ? "orbFloatSm" : "orbFloat"} ${it.duration || 8}s ease-in-out infinite ${it.delay || 0}s`,
          }}
        >
          {it.children}
        </motion.div>
      ))}
    </div>
  );
}

/**
 * Soft-glass chip ornament. Use as children of FloatingOrnaments items.
 */
export function GlassChip({ icon: Icon, iconAccent, label, value, valueAccent }) {
  return (
    <div className="chip-soft inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold text-slate-700 shadow-[0_8px_22px_-10px_rgba(99,102,241,0.35)]">
      {Icon && (
        <span
          className={`grid h-5 w-5 place-items-center rounded-full bg-gradient-to-br ${
            iconAccent || "from-indigo-500 to-fuchsia-500"
          }`}
        >
          <Icon size={10} className="text-white" />
        </span>
      )}
      <span className="font-body text-slate-700">{label}</span>
      {value && (
        <span className={`font-display font-bold ${valueAccent || "text-[#0a0e27]"}`}>
          {value}
        </span>
      )}
    </div>
  );
}

/** Decorative ring ornament with optional inner icon. */
export function GlowRing({ size = 64, color = "rgba(99,102,241,0.25)", icon: Icon }) {
  return (
    <div
      className="grid place-items-center rounded-full"
      style={{
        width: size,
        height: size,
        border: `2px solid ${color}`,
        boxShadow: `0 0 30px -8px ${color.replace("0.25", "0.4")}`,
      }}
    >
      {Icon && <Icon size={size * 0.32} className="text-indigo-500/70" />}
    </div>
  );
}

/** Soft floating orb dot (purely decorative). */
export function Orb({ size = 16, gradient = "from-indigo-500 to-fuchsia-500" }) {
  return (
    <div
      className={`rounded-full bg-gradient-to-br ${gradient} shadow-[0_0_24px_-4px_rgba(167,139,250,0.55)]`}
      style={{ width: size, height: size }}
    />
  );
}
