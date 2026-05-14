import { motion, AnimatePresence } from "framer-motion";
import { useSyncInsights } from "../../hooks/useInsights";

function SpinnerIcon() {
  return (
    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

const iconVariants = {
  initial: { opacity: 0, scale: 0.7, filter: "blur(4px)" },
  animate: { opacity: 1, scale: 1, filter: "blur(0px)", transition: { type: "spring", duration: 0.32, bounce: 0 } },
  exit:    { opacity: 0, scale: 0.7, filter: "blur(4px)", transition: { duration: 0.15 } },
};

const labelVariants = {
  initial: { opacity: 0, x: -6 },
  animate: { opacity: 1, x: 0, transition: { type: "spring", duration: 0.28, bounce: 0 } },
  exit:    { opacity: 0, x: 6, transition: { duration: 0.12 } },
};

export default function SyncButton({ days }) {
  const { syncing, synced, trigger } = useSyncInsights(days);
  const state = syncing ? "syncing" : synced ? "synced" : "idle";

  return (
    <motion.button
      onClick={trigger}
      disabled={syncing}
      whileHover={{ scale: syncing ? 1 : 1.03 }}
      whileTap={{ scale: syncing ? 1 : 0.97 }}
      transition={{ type: "spring", duration: 0.2, bounce: 0 }}
      className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
      style={{
        background: synced
          ? "rgba(16,185,129,0.12)"
          : "linear-gradient(135deg, #7c3aed, #6d28d9)",
        color: synced ? "#059669" : "#fff",
        border: synced
          ? "1px solid rgba(16,185,129,0.25)"
          : "1px solid rgba(124,58,237,0.35)",
        boxShadow: synced
          ? "0 1px 3px rgba(0,0,0,0.05)"
          : "0 4px 16px rgba(109,40,217,0.25), 0 1px 3px rgba(0,0,0,0.06)",
        opacity: syncing ? 0.8 : 1,
        cursor: syncing ? "not-allowed" : "pointer",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={`icon-${state}`}
          variants={iconVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          style={{ display: "flex", alignItems: "center" }}
        >
          {syncing ? <SpinnerIcon /> : synced ? <CheckIcon /> : <RefreshIcon />}
        </motion.span>
      </AnimatePresence>

      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={`label-${state}`}
          variants={labelVariants}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          {syncing ? "Syncing…" : synced ? "Synced!" : "Sync data"}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}
