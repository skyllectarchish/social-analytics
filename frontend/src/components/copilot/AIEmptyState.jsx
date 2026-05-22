// Shared empty-state primitive for AI surfaces. See plan §27. Pass an
// icon component (lucide-react) and the copy; pass an optional CTA.
export default function AIEmptyState({ icon: Icon, title, body, cta, tone = "neutral" }) {
  const accent =
    tone === "warning"
      ? { border: "rgba(245,158,11,0.30)", iconBg: "rgba(245,158,11,0.10)", iconColor: "#b45309" }
      : tone === "danger"
      ? { border: "rgba(244,63,94,0.25)", iconBg: "rgba(244,63,94,0.08)", iconColor: "#e11d48" }
      : { border: "rgba(15,23,42,0.10)", iconBg: "rgba(15,23,42,0.04)", iconColor: "#64748b" };

  return (
    <div
      className="rounded-2xl px-6 py-8 text-center space-y-3"
      style={{
        border: `1px dashed ${accent.border}`,
        background: "rgba(248,250,252,0.6)",
      }}
    >
      {Icon && (
        <div
          className="w-10 h-10 rounded-full mx-auto flex items-center justify-center"
          style={{ background: accent.iconBg }}
        >
          <Icon size={18} style={{ color: accent.iconColor }} />
        </div>
      )}
      {title && <h3 className="text-sm font-semibold text-slate-800">{title}</h3>}
      {body && (
        <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">{body}</p>
      )}
      {cta && <div className="pt-1">{cta}</div>}
    </div>
  );
}
