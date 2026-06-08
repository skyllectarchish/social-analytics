import { useEffect, useState } from "react";
import { Activity, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { safeGet } from "../../api/client";
import type { FormatFatigueResponse } from "../../api/types";
import Sparkline from "../charts/Sparkline";
import { PALETTE } from "../../data/mock";

const STATUS_STYLE: Record<string, { icon: typeof TrendingUp; chip: string; spark: string }> = {
  declining: { icon: TrendingDown, chip: "bg-rose-50 text-rose-600", spark: "#f43f5e" },
  improving: { icon: TrendingUp, chip: "bg-emerald-50 text-emerald-600", spark: "#10b981" },
  steady: { icon: Minus, chip: "bg-black/5 text-foreground/55", spark: PALETTE.violet },
};

const FORMAT_LABEL: Record<string, string> = {
  REELS: "Reels",
  CAROUSEL: "Carousels",
  IMAGE: "Image posts",
};

// Deterministic (no AI quota) per-format trend verdicts over recent weeks.
export default function FormatFatigueCard() {
  const [res, setRes] = useState<FormatFatigueResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    safeGet<FormatFatigueResponse>("/instagram/insights/format-fatigue", { weeks: 26 }).then((r) => {
      if (!alive) return;
      setRes(r);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  if (loading) return null;

  return (
    <div className="card-hairline p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Activity className="h-4 w-4 text-violet" /> Format health
      </h2>
      <p className="text-xs text-foreground/55">
        Is a format wearing out for you specifically? Weekly engagement trend per format, last 26 weeks.
      </p>

      {!res || res.formats.length === 0 ? (
        <p className="mt-3 rounded-xl bg-black/[0.03] px-4 py-5 text-center text-sm text-foreground/55">
          Not enough recent posting to judge — a verdict needs at least 4 posting-weeks per format.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {res.formats.map((f) => {
            const s = STATUS_STYLE[f.status] ?? STATUS_STYLE.steady;
            const Icon = s.icon;
            return (
              <div key={f.format} className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{FORMAT_LABEL[f.format] ?? f.format}</h3>
                  <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.chip}`}>
                    <Icon className="h-3 w-3" /> {f.status}
                  </span>
                </div>
                <div className="mt-2 h-9">
                  <Sparkline data={f.weekly.map((w) => ({ v: w.avg_engagement }))} color={s.spark} />
                </div>
                <p className="mt-2 text-xs text-foreground/60">{f.message}</p>
                {f.change_pct != null && (
                  <p className="num mt-1 text-[11px] text-foreground/45">
                    {f.change_pct > 0 ? "+" : ""}{f.change_pct}% vs baseline · {f.weeks_analyzed} posting-weeks
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
