import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft } from "lucide-react";

export default function DrillDownChart({
  title,
  subtitle,
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
    <div className={`d-card p-5 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {drillStack.length > 1 && (
            <motion.button
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              onClick={onBack}
              className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <ChevronLeft size={18} />
            </motion.button>
          )}
          <div>
            <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
        </div>

        {levels.length > 1 && (
          <div className="flex items-center gap-1.5">
            {levels.map((l, i) => (
              <div
                key={l}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i <= current.level ? "w-5 bg-violet-400" : "w-1.5 bg-slate-200"
                }`}
              />
            ))}
          </div>
        )}
      </div>

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
  );
}
