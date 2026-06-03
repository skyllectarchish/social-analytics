import type { TooltipProps } from "recharts";

// Frosted tooltip shared across every Recharts surface.
export default function GlassTooltip({
  active,
  payload,
  label,
  unit = "",
  labelText,
}: TooltipProps<number, string> & { unit?: string; labelText?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  const value = payload[0].value as number;
  return (
    <div
      className="glass px-3 py-2"
      style={{ borderRadius: "0.75rem", minWidth: 0 }}
    >
      {label !== undefined && (
        <div className="text-[11px] font-medium text-muted-foreground">
          {labelText ?? String(label)}
        </div>
      )}
      <div className="tabular text-sm font-semibold text-foreground">
        {typeof value === "number" ? value.toLocaleString() : value}
        {unit}
      </div>
    </div>
  );
}
