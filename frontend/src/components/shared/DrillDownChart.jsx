import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft } from "lucide-react";

export default function DrillDownChart({
  title,
  subtitle,
  icon: Icon,
  children,
  levels = [],
  className = "",
}) {
  const [drillStack, setDrillStack] = useState([{ level: 0, context: null }]);
  const current = drillStack[drillStack.length - 1];

  const onDrill = useCallback(
    (context) => {
      if (current.level < levels.length - 1) {
        setDrillStack((s) => [...s, { level: current.level + 1, context }]);
      }
    },
    [current.level, levels.length],
  );

  const onBack = useCallback(() => {
    setDrillStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  }, []);

  return (
    <div className={`lab-card overflow-hidden ${className}`}>
      <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-3.5 border-b border-slate-100">
        <div className="flex items-center gap-2.5 min-w-0">
          {drillStack.length > 1 ? (
            <motion.button
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              onClick={onBack}
              className="grid place-items-center w-8 h-8 rounded-xl lab-chip shrink-0 hover:brightness-110 transition"
              aria-label="Back"
            >
              <ChevronLeft size={16} />
            </motion.button>
          ) : (
            Icon && (
              <span className="grid place-items-center w-8 h-8 rounded-xl lab-chip shrink-0">
                <Icon size={15} strokeWidth={2.25} />
              </span>
            )
          )}
          <div className="min-w-0">
            <h3 className="text-[13px] font-semibold text-slate-900 leading-tight tracking-tight">
              {title}
            </h3>
            {subtitle && (
              <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{subtitle}</p>
            )}
          </div>
        </div>

        {levels.length > 1 && (
          <div className="flex items-center gap-1.5 shrink-0">
            {levels.map((l, i) => (
              <div
                key={l}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i <= current.level ? "w-5 bg-violet-500" : "w-1.5 bg-slate-200"
                }`}
              />
            ))}
          </div>
        )}
      </header>

      <div className="p-5">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${current.level}|${JSON.stringify(current.context)}`}
            initial={{ opacity: 0, y: 6, filter: "blur(3px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -4, filter: "blur(3px)" }}
            transition={{ type: "spring", duration: 0.35, bounce: 0 }}
          >
            {children(current, onDrill)}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
