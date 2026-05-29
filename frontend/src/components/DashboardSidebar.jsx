import { NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { BarChart3, FlaskConical, Film, Users, LineChart, Sparkles } from "lucide-react";
import { anyAIOn } from "../utils/featureFlags";

const BASE_NAV_ITEMS = [
  { to: "/dashboard", icon: BarChart3, label: "Overview" },
  { to: "/dashboard/content", icon: FlaskConical, label: "Content Lab" },
  { to: "/dashboard/reels", icon: Film, label: "Reels Studio" },
  { to: "/dashboard/audience", icon: Users, label: "Audience DNA" },
  { to: "/dashboard/competitors", icon: LineChart, label: "Competitors" },
];

const NAV_ITEMS = anyAIOn()
  ? [
      ...BASE_NAV_ITEMS,
      { to: "/dashboard/copilot", icon: Sparkles, label: "Copilot", beta: true },
    ]
  : BASE_NAV_ITEMS;

export default function DashboardSidebar() {
  const { pathname } = useLocation();

  return (
    <nav
      aria-label="Dashboard sections"
      className="sticky top-[56px] z-40 self-start shrink-0 w-16 md:w-56 h-[calc(100dvh-56px)] overflow-y-auto overflow-x-hidden py-3 flex flex-col gap-0.5"
      style={{
        background: "rgba(255,255,255,0.90)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderRight: "1px solid rgba(15,23,42,0.07)",
        scrollbarWidth: "none",
        msOverflowStyle: "none",
      }}
    >
      {NAV_ITEMS.map(({ to, icon: Icon, label, beta }) => {
        const isActive = pathname === to;
        return (
          <NavLink
            key={to}
            to={to}
            title={label}
            aria-label={label}
            className="group relative mx-2 flex items-center gap-3 rounded-xl px-3 md:px-3.5 py-2.5 text-sm font-medium transition-colors justify-center md:justify-start focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            style={{
              color: isActive ? "#7c3aed" : "#64748b",
              background: isActive ? "rgba(139,92,246,0.10)" : "transparent",
            }}
          >
            {isActive && (
              <motion.div
                layoutId="sidebar-active-indicator"
                className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full"
                style={{ background: "linear-gradient(180deg, #8b5cf6, #ec4899)" }}
                transition={{ type: "spring", duration: 0.4, bounce: 0 }}
              />
            )}
            <Icon
              size={18}
              strokeWidth={isActive ? 2.2 : 1.8}
              className="shrink-0 transition-colors group-hover:text-slate-800"
              style={isActive ? { color: "#7c3aed" } : undefined}
            />
            <span className="hidden md:inline truncate">{label}</span>
            {beta && (
              <span
                className="hidden md:inline-flex text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md ml-auto"
                style={{ background: "rgba(139,92,246,0.12)", color: "#7c3aed" }}
              >
                Beta
              </span>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}
