import { motion } from "framer-motion";
import AnimatedCounter from "../landing/ui/AnimatedCounter";
import { useDashboard } from "../../hooks/useInsights";

const CARDS = [
  {
    key: "total_views",
    label: "Total Views",
    cardClass: "card-lavender",
    accentColor: "#8b5cf6",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    key: "total_reach",
    label: "Total Reach",
    cardClass: "card-sky",
    accentColor: "#3b82f6",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
      </svg>
    ),
  },
  {
    key: "total_interactions",
    label: "Interactions",
    cardClass: "card-pink",
    accentColor: "#ec4899",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
      </svg>
    ),
  },
  {
    key: "net_follower_growth",
    label: "Follower Growth",
    cardClass: "card-mint",
    accentColor: "#10b981",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
      </svg>
    ),
  },
];

function SkeletonCard() {
  return (
    <div className="metric-card card-lavender">
      <div className="animate-pulse space-y-3">
        <div className="w-10 h-10 rounded-xl bg-slate-200" />
        <div className="h-8 w-24 rounded-lg bg-slate-200" />
        <div className="h-3 w-20 rounded bg-slate-200" />
      </div>
    </div>
  );
}

export default function HeroCards({ days }) {
  const { data, loading, error } = useDashboard(days);

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {CARDS.map((c) => <SkeletonCard key={c.key} />)}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="glass rounded-2xl p-6 text-center text-slate-500 text-sm">
        {error || "No dashboard data. Run a sync first."}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {CARDS.map((card, i) => {
        const value = data[card.key] ?? 0;
        const isGrowth = card.key === "net_follower_growth";
        const isPositive = value >= 0;

        return (
          <motion.div
            key={card.key}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.07 }}
            className={`metric-card ${card.cardClass}`}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
              style={{ background: `${card.accentColor}18`, color: card.accentColor }}
            >
              {card.icon}
            </div>

            <div className="font-display text-3xl font-semibold text-[#0a0e27] mb-1">
              {isGrowth && value > 0 && "+"}
              <AnimatedCounter value={Math.abs(value)} />
              {isGrowth && value < 0 && (
                <span className="text-rose-500 text-2xl ml-0.5">↓</span>
              )}
            </div>

            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-2">
              {card.label}
            </p>

            {isGrowth && (
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  isPositive
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-rose-100 text-rose-700"
                }`}
              >
                {isPositive ? "+" : ""}{value} this period
              </span>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
