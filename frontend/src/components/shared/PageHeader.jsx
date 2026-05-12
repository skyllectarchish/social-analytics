import { motion } from "framer-motion";
import PeriodSelector from "../dashboard/PeriodSelector";

export default function PageHeader({ title, subtitle, emoji, days, onDaysChange, actions }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ type: "spring", duration: 0.45, bounce: 0 }}
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-7"
    >
      <div>
        <h1 className="font-display text-3xl font-semibold text-slate-900 tracking-tight flex items-center gap-3">
          {emoji && <span className="text-2xl">{emoji}</span>}
          {title}
        </h1>
        {subtitle && (
          <p className="text-slate-500 text-[13px] mt-1.5 max-w-lg">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        {days !== undefined && <PeriodSelector days={days} onChange={onDaysChange} />}
        {actions}
      </div>
    </motion.div>
  );
}
