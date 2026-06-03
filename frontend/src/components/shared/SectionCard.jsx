import { motion } from "framer-motion";

/**
 * Standardized card chrome for the analytics surfaces.
 *
 * Gives every panel the same header rhythm — an icon chip, a tight title, an
 * optional muted subtitle, and a right-aligned actions slot — separated from
 * the body by a hairline divider. This is the backbone of the Content Lab's
 * "enterprise analytics" look: consistent padding, borders, and typography
 * across otherwise very different charts and tables.
 *
 * Props:
 *   icon      lucide icon component (rendered in the header chip)
 *   title     header title
 *   subtitle  muted one-liner under the title
 *   actions   node rendered at the right of the header (legend, toggle, etc.)
 *   delay     entrance-animation stagger
 *   bodyClassName  classes for the padded body wrapper
 *   flush     drop body padding (for edge-to-edge tables/heatmaps)
 */
export default function SectionCard({
  icon: Icon,
  title,
  subtitle,
  actions,
  delay = 0,
  className = "",
  bodyClassName = "",
  flush = false,
  children,
  ...props
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", duration: 0.45, bounce: 0, delay }}
      whileHover={{ y: -3 }}
      className={`lab-card overflow-hidden ${className}`}
      {...props}
    >
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 px-4 pt-3 pb-2.5 border-b border-slate-100">
          <div className="flex items-start gap-2.5 min-w-0">
            {Icon && (
              <span className="grid place-items-center w-7 h-7 rounded-xl lab-chip shrink-0 mt-px">
                <Icon size={15} strokeWidth={2.25} />
              </span>
            )}
            <div className="min-w-0">
              {title && (
                <h3 className="text-[13px] font-semibold text-slate-900 leading-tight tracking-tight">
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{subtitle}</p>
              )}
            </div>
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
      )}
      <div className={flush ? "" : `p-4 ${bodyClassName}`}>{children}</div>
    </motion.section>
  );
}

/**
 * Page-level group label — an uppercase eyebrow with an icon and a hairline
 * rule that fills the row. Used to segment a long analytics page into sections
 * (e.g. "Hashtags") without competing with the card titles below it.
 */
export function SectionDivider({ icon: Icon, title, hint }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2.5 shrink-0">
        {Icon && (
          <span className="grid place-items-center w-7 h-7 rounded-lg lab-chip">
            <Icon size={14} strokeWidth={2.25} />
          </span>
        )}
        <h2 className="ig-gradient text-sm font-bold uppercase tracking-[0.1em]">
          {title}
        </h2>
      </div>
      {hint && <span className="text-[11px] text-slate-500 shrink-0">{hint}</span>}
      <div className="flex-1 h-px bg-gradient-to-r from-violet-300/70 via-slate-200 to-transparent" />
    </div>
  );
}
