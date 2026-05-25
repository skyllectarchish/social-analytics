import { useState } from "react";
import { Sparkles, AlertCircle } from "lucide-react";
import { useAIQuota } from "../../hooks/useAIQuota";

function formatResetDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export default function AIQuotaBadge({ variant = "compact", tooltip = true }) {
  const { loading, used, limit, resetsAt, exhausted, percentUsed } = useAIQuota();
  const [hovered, setHovered] = useState(false);

  if (loading) {
    return (
      <div
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium"
        style={{ background: "rgba(15,23,42,0.04)", color: "#94a3b8" }}
        aria-busy="true"
        aria-label="Loading AI quota"
      >
        <Sparkles size={11} />
        <span>—</span>
      </div>
    );
  }
  if (limit === 0) {
    // Real "no quota configured" state — visually distinct from the loading
    // placeholder so users can tell their account just isn't gated yet.
    return (
      <div
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium"
        style={{ background: "rgba(15,23,42,0.04)", color: "#94a3b8" }}
        title="No quota configured"
      >
        <Sparkles size={11} />
        <span>No quota</span>
      </div>
    );
  }

  const Icon = exhausted ? AlertCircle : Sparkles;
  const bg = exhausted
    ? "rgba(244,63,94,0.08)"
    : percentUsed >= 80
    ? "rgba(245,158,11,0.10)"
    : "rgba(139,92,246,0.08)";
  const fg = exhausted
    ? "#e11d48"
    : percentUsed >= 80
    ? "#b45309"
    : "#7c3aed";

  const label =
    variant === "verbose"
      ? `${used} of ${limit} AI calls${
          resetsAt ? ` · resets ${formatResetDate(resetsAt)}` : ""
        }`
      : `${used} / ${limit}`;

  const tooltipText = exhausted
    ? `You've used all your AI calls.${
        resetsAt ? ` Resets ${formatResetDate(resetsAt)}.` : ""
      }`
    : `${used} of ${limit} AI calls this month${
        resetsAt ? ` · resets ${formatResetDate(resetsAt)}` : ""
      }`;

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
        style={{ background: bg, color: fg }}
        role="status"
        aria-label={tooltipText}
      >
        <Icon size={11} />
        <span className="font-mono tabular-nums">{label}</span>
      </div>
      {tooltip && hovered && variant === "compact" && (
        <div
          className="absolute right-0 top-full mt-1.5 z-50 whitespace-nowrap px-2.5 py-1.5 rounded-md text-[11px]"
          style={{
            background: "#0f172a",
            color: "#f1f5f9",
            boxShadow: "0 4px 12px rgba(15,23,42,0.18)",
          }}
        >
          {tooltipText}
        </div>
      )}
    </div>
  );
}
