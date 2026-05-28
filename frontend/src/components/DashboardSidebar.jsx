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
      className="sticky top-[56px] z-40 w-full overflow-x-auto"
      style={{
        background: "rgba(255,255,255,0.90)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderBottom: "1px solid rgba(15,23,42,0.07)",
        scrollbarWidth: "none",
        msOverflowStyle: "none",
      }}
    >
      <div className="flex items-stretch px-4 sm:px-6">
        {NAV_ITEMS.map(({ to, icon: Icon, label, beta }) => {
          const isActive = pathname === to;
          return (
            <NavLink
              key={to}
              to={to}
              className="relative flex items-center gap-2 px-3.5 py-2 shrink-0 text-sm font-medium transition-colors whitespace-nowrap"
              style={{
                color: isActive ? "#7c3aed" : "#64748b",
              }}
            >
              {isActive && (
                <motion.div
                  layoutId="tab-active-indicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                  style={{
                    background: "linear-gradient(90deg, #8b5cf6, #ec4899)",
                  }}
                  transition={{ type: "spring", duration: 0.4, bounce: 0 }}
                />
              )}
              <Icon
                size={16}
                strokeWidth={isActive ? 2.2 : 1.8}
                className="shrink-0"
              />
              <span>{label}</span>
              {beta && (
                <span
                  className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md"
                  style={{
                    background: "rgba(139,92,246,0.12)",
                    color: "#7c3aed",
                  }}
                >
                  Beta
                </span>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
