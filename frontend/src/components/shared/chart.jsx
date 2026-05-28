/**
 * Shared chart styling tokens + a consistent tooltip, so every recharts surface
 * in the analytics pages reads as one system: hairline grid, muted slate axes,
 * a restrained accent ramp (built around the product's violet), and a single
 * frosted tooltip chrome.
 */

export const AXIS_TICK = {
  fill: "#94a3b8",
  fontSize: 11,
  fontFamily: "var(--font-sans, system-ui)",
};

export const GRID_STROKE = "rgba(15,23,42,0.06)";

// Enterprise accent ramp — anchored on the product violet, then cool/warm
// supporting hues. Restrained and evenly weighted for categorical series.
export const SERIES_COLORS = ["#7c3aed", "#0ea5e9", "#f59e0b", "#10b981", "#ec4899", "#64748b"];

export const ACCENT = "#7c3aed";
export const ACCENT_SOFT = "rgba(124,58,237,0.10)";

const tooltipBox = {
  background: "rgba(255,255,255,0.98)",
  border: "1px solid rgba(15,23,42,0.08)",
  borderRadius: 12,
  padding: "10px 12px",
  boxShadow: "0 8px 28px rgba(15,23,42,0.10), 0 2px 6px rgba(15,23,42,0.05)",
  backdropFilter: "blur(8px)",
  minWidth: 150,
};

/**
 * Drop-in recharts <Tooltip content={...}> renderer with the shared chrome.
 * Pass `labelFormatter(label)` and/or `formatter(value, entry)` to customize.
 */
export function ChartTooltip({ active, payload, label, labelFormatter, formatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={tooltipBox}>
      {label != null && label !== "" && (
        <p
          style={{
            color: "#94a3b8",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginBottom: payload.length ? 8 : 0,
          }}
        >
          {labelFormatter ? labelFormatter(label) : label}
        </p>
      )}
      {payload.map((p, i) => (
        <div
          key={i}
          style={{ display: "flex", alignItems: "center", gap: 8, marginTop: i ? 6 : 0 }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: p.color || p.fill || ACCENT,
              flexShrink: 0,
            }}
          />
          <span style={{ color: "#64748b", fontSize: 12, flex: 1, whiteSpace: "nowrap" }}>
            {p.name}
          </span>
          <span
            className="metric-value"
            style={{ color: "#0f172a", fontSize: 13, marginLeft: 12 }}
          >
            {formatter ? formatter(p.value, p) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}
