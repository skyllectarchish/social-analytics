import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";

export type DrillState<C> = { level: number; context: C | null };

// Card wrapper for click-to-drill-down charts: header with back button +
// level-progress dots, blur-crossfade between levels.
export default function DrillDown<C>({
  title,
  subtitle,
  levels,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  levels: string[]; // e.g. ["By format", "Per post"]
  children: (state: DrillState<C>, drill: (c: C) => void, back: () => void) => ReactNode;
  className?: string;
}) {
  const [stack, setStack] = useState<DrillState<C>[]>([{ level: 0, context: null }]);
  const current = stack[stack.length - 1];

  const drill = (context: C) => {
    if (current.level < levels.length - 1) {
      setStack((s) => [...s, { level: current.level + 1, context }]);
    }
  };
  const back = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));

  return (
    <div className={`card-hairline p-5 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          {stack.length > 1 && (
            <motion.button
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              onClick={back}
              className="-ml-1 rounded-lg p-1 text-foreground/50 transition hover:bg-black/5 hover:text-foreground/80"
              aria-label="Back"
            >
              <ChevronLeft size={18} />
            </motion.button>
          )}
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            {subtitle && <p className="text-xs text-foreground/55">{subtitle}</p>}
          </div>
        </div>
        {levels.length > 1 && (
          <div className="flex items-center gap-1.5" aria-hidden>
            {levels.map((l, i) => (
              <div
                key={l}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i <= current.level ? "w-5 bg-violet" : "w-1.5 bg-black/10"
                }`}
              />
            ))}
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={`${current.level}:${JSON.stringify(current.context)}`}
          initial={{ opacity: 0, y: 6, filter: "blur(3px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -4, filter: "blur(3px)" }}
          transition={{ type: "spring", duration: 0.35, bounce: 0 }}
        >
          {children(current, drill, back)}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
