import { ArrowUpRight, BellRing, Flame, TrendingDown, TrendingUp } from "lucide-react";
import type { AlertItem } from "../../api/types";

// Per-kind icon + tint. Warnings (drops) get rose, surges emerald, posts amber.
const STYLE: Record<AlertItem["kind"], { icon: typeof TrendingUp; chip: string; dot: string }> = {
  metric_drop: { icon: TrendingDown, chip: "bg-rose-50 text-rose-600", dot: "bg-rose-500" },
  metric_surge: { icon: TrendingUp, chip: "bg-emerald-50 text-emerald-600", dot: "bg-emerald-500" },
  post_overperform: { icon: Flame, chip: "bg-amber-50 text-amber-600", dot: "bg-amber-500" },
};

export default function AlertsCard({
  alerts,
  periodDays,
  onOpenPost,
}: {
  alerts: AlertItem[];
  periodDays: number;
  onOpenPost?: (a: AlertItem) => void;
}) {
  if (alerts.length === 0) return null;

  return (
    <div className="card-hairline p-5">
      <div className="flex items-center gap-2">
        <BellRing className="h-4 w-4 text-violet" />
        <h2 className="text-lg font-semibold">Alerts</h2>
        <span className="chip !px-2 !py-0.5 !text-[10px]">
          last {periodDays} days vs baseline
        </span>
      </div>
      <ul className="mt-4 space-y-2">
        {alerts.map((a) => {
          const s = STYLE[a.kind];
          const Icon = s.icon;
          const isPost = a.kind === "post_overperform" && a.ig_media_id;
          const body = (
            <>
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${s.chip}`}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} />
                  <span className="truncate">{a.title}</span>
                </span>
                <span className="mt-0.5 block text-xs text-foreground/60">{a.detail}</span>
                {a.caption && (
                  <span className="mt-0.5 block truncate text-xs italic text-foreground/45">
                    “{a.caption}”
                  </span>
                )}
              </span>
            </>
          );
          return (
            <li key={a.id}>
              {isPost ? (
                <button
                  onClick={() => onOpenPost?.(a)}
                  className="group flex w-full items-start gap-3 rounded-2xl p-2 text-left transition hover:bg-white/60"
                >
                  {body}
                  <ArrowUpRight className="mt-1 h-3.5 w-3.5 shrink-0 text-foreground/30 transition group-hover:text-violet" />
                </button>
              ) : (
                <div className="flex items-start gap-3 rounded-2xl p-2">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
