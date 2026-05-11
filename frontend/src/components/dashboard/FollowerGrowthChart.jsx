import { useOverview } from "../../hooks/useInsights";

const W = 500;
const H = 180;
const PAD = { t: 10, r: 10, b: 32, l: 10 };
const CW = W - PAD.l - PAD.r;
const CH = H - PAD.t - PAD.b;

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function ChartSkeleton() {
  return (
    <div className="glass rounded-2xl p-5 animate-pulse">
      <div className="h-4 w-36 bg-slate-200 rounded mb-6" />
      <div className="h-44 bg-slate-100 rounded-xl" />
    </div>
  );
}

export default function FollowerGrowthChart({ days }) {
  const { data: overview, loading } = useOverview(days);

  if (loading) return <ChartSkeleton />;

  const followsData = overview?.follows_and_unfollows?.data ?? [];
  const n = followsData.length;

  const maxAbs = Math.max(...followsData.map((d) => Math.abs(d.value)), 1);
  const baseline = PAD.t + CH / 2;
  const barSlot = n > 0 ? CW / n : CW;
  const barW = Math.max(barSlot * 0.55, 2);

  const xOf = (i) => PAD.l + i * barSlot + barSlot / 2;
  const barH = (v) => (Math.abs(v) / maxAbs) * (CH / 2 - 4);

  const labelStep = n > 12 ? Math.ceil(n / 6) : 1;

  return (
    <div className="glass rounded-2xl p-5" style={{ boxShadow: "var(--shadow-soft)" }}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Follower Change
        </p>
        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm inline-block bg-emerald-400" /> Gained
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm inline-block bg-rose-400" /> Lost
          </span>
        </div>
      </div>

      {n === 0 ? (
        <div className="h-44 flex items-center justify-center text-sm text-slate-400">
          No data yet — run a sync to populate.
        </div>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" style={{ height: 176 }}>
          <line
            x1={PAD.l} x2={W - PAD.r} y1={baseline} y2={baseline}
            stroke="rgba(15,23,42,0.10)" strokeWidth="1"
          />

          {followsData.map((d, i) => {
            const h = barH(d.value);
            const isPos = d.value >= 0;
            const x = xOf(i) - barW / 2;
            const y = isPos ? baseline - h : baseline;
            return (
              <rect
                key={i}
                x={x.toFixed(1)}
                y={y.toFixed(1)}
                width={barW.toFixed(1)}
                height={h.toFixed(1)}
                rx="2"
                fill={isPos ? "#34d399" : "#fb7185"}
                className="bar-rise"
                style={{ animationDelay: `${i * 0.02}s` }}
              />
            );
          })}

          {followsData.map((d, i) => {
            if (i % labelStep !== 0) return null;
            return (
              <text
                key={i}
                x={xOf(i).toFixed(1)}
                y={H - 4}
                textAnchor="middle"
                style={{ fontSize: 9, fill: "#94a3b8", fontFamily: "system-ui" }}
              >
                {fmtDate(d.end_time)}
              </text>
            );
          })}
        </svg>
      )}
    </div>
  );
}
