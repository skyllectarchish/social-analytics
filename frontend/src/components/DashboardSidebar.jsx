import { NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { BarChart3, FlaskConical, Film, Users, LineChart } from "lucide-react";

const NAV_ITEMS = [
  { to: "/dashboard", icon: BarChart3, label: "Overview" },
  { to: "/dashboard/content", icon: FlaskConical, label: "Content Lab" },
  { to: "/dashboard/reels", icon: Film, label: "Reels Studio" },
  { to: "/dashboard/audience", icon: Users, label: "Audience DNA" },
  { to: "/dashboard/competitors", icon: LineChart, label: "Competitors" },
];

export default function DashboardSidebar() {
  const { pathname } = useLocation();

  return (
    <aside className="hidden lg:flex flex-col w-[220px] shrink-0 h-[calc(100dvh-56px)] sticky top-[56px] py-5 px-3 gap-1">
      {NAV_ITEMS.map(({ to, icon: Icon, label }) => {
        const isActive = pathname === to;
        return (
          <NavLink key={to} to={to} className="relative">
            {isActive && (
              <motion.div
                layoutId="sidebar-active"
                className="absolute inset-0 rounded-xl"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(139,92,246,0.10), rgba(236,72,153,0.06))",
                  border: "1px solid rgba(139,92,246,0.12)",
                }}
                transition={{ type: "spring", duration: 0.45, bounce: 0 }}
              />
            )}
            <div
              className={`relative flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? "text-violet-700"
                  : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
              }`}
            >
              <Icon size={18} strokeWidth={isActive ? 2.2 : 1.8} />
              <span>{label}</span>
            </div>
          </NavLink>
        );
      })}

      <div className="mt-auto px-3 pt-4 border-t border-slate-100">
        <p className="text-[11px] text-slate-400 font-medium tracking-wide">CREATOR OS</p>
      </div>
    </aside>
  );
}
