import { motion } from "framer-motion";

export default function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  className = "",
}) {
  const isCenter = align === "center";

  return (
    <div className={`${isCenter ? "mx-auto max-w-3xl text-center" : "max-w-2xl"} ${className}`}>
      {eyebrow && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-15% 0px" }}
          transition={{ duration: 0.5 }}
          className="chip-soft inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-700"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 shadow-[0_0_10px_rgba(167,139,250,0.9)]" />
          {eyebrow}
        </motion.div>
      )}
      <motion.h2
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-15% 0px" }}
        transition={{ duration: 0.6, delay: 0.05 }}
        className="font-display mt-6 text-balance text-[clamp(2.25rem,5vw,3.75rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-[#0a0e27]"
      >
        {title}
      </motion.h2>
      {description && (
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-15% 0px" }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="font-body mt-5 text-pretty text-base leading-[1.55] text-slate-600 sm:text-lg"
        >
          {description}
        </motion.p>
      )}
    </div>
  );
}
