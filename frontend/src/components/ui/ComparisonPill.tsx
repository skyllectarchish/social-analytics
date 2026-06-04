import { Minus, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { pctDelta } from "../../lib/stats";

// Delta pill for prior-period comparisons: arrow + signed %, optional ✨ when
// the change is statistically significant. Renders nothing when there is no
// prior value to compare against.
export default function ComparisonPill({
  current,
  prior,
  deltaPct,
  significant,
  invert = false, // for metrics where DOWN is good (e.g. skip rate)
  suffix = "vs prior",
  className = "",
}: {
  current: number;
  prior?: number | null;
  deltaPct?: number | null; // pass directly when the API pre-computed it
  significant?: boolean | null;
  invert?: boolean;
  suffix?: string;
  className?: string;
}) {
  const delta = deltaPct ?? pctDelta(current, prior);
  if (delta == null) return null;
  const up = delta >= 0;
  const good = invert ? !up : up;
  const Icon = Math.abs(delta) < 0.05 ? Minus : up ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${
        Math.abs(delta) < 0.05 ? "text-foreground/50" : good ? "text-emerald-600" : "text-rose-500"
      } ${className}`}
    >
      <Icon className="h-3 w-3" />
      <span className="num">
        {up ? "+" : ""}
        {delta.toFixed(1)}%
      </span>
      <span className="text-foreground/45">{suffix}</span>
      {significant && (
        <span title="Statistically significant change">
          <Sparkles className="h-3 w-3 text-violet" />
        </span>
      )}
    </span>
  );
}
