import { useOverview } from "../../hooks/useInsights";

const W = 500;
const H = 180;
const PAD = { t: 10, r: 20, b: 32, l: 48 };
const CW = W - PAD.l - PAD.r;
const CH = H - PAD.t - PAD.b;

function buildPath(points, xOf, yOf) {
  if (!points.length) return "";
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${xOf(i).toFixed(1)} ${yOf(p.value).toFixed(1)}`).join(" ");
}

function buildArea(linePath, n, xOf) {
  if (!linePath) return "";
  return `${linePath} L ${xOf(n - 1).toFixed(1)} ${(PAD.t + CH).toFixed(1)} L ${xOf(0).toFixed(1)} ${(PAD.t + CH).toFixed(1)} Z`;
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtVal(v) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(Math.round(v));
}

function ChartSkeleton() {
  return (
    <div className="glass rounded-2xl p-5 animate-pulse">
      <div className="h-4 w-32 bg-slate-200 rounded mb-6" />
      <div className="h-44 bg-slate-100 rounded-xl" />
    </div>
  );
}

export default function EngagementChart({ days }) {
  const { data: overview, loading, error } = useOverview(days);

  if (loading) return <ChartSkeleton />;

  const viewsData = overview?.views?.data ?? [];
  const reachData = overview?.reach?.data ?? [];
  const n = viewsData.length;

  const allVals = [...viewsData.map((d) => d.value), ...reachData.map((d) => d.value)];
  const maxVal = Math.max(...allVals, 1);

  const xOf = (i) => PAD.l + (n <= 1 ? CW / 2 : (i / (n - 1)) * CW);
  const yOf = (v) => PAD.t + CH - (v / maxVal) * CH;

  const viewsLine = buildPath(viewsData, xOf, yOf);
  const viewsArea = buildArea(viewsLine, n, xOf);
  const reachLine = buildPath(reachData, xOf, yOf);

  const gridYs = [0.25, 0.5, 0.75, 1].map((f) => ({ y: yOf(maxVal * f), label: fmtVal(maxVal * f) }));

  const labelIdxs = n > 4
    ? [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4), n - 1]
    : Array.from({ length: n }, (_, i) => i);
  const uniqueIdxs = [...new Set(labelIdxs)];

  return (
    <div className="glass rounded-2xl p-5" style={{ boxShadow: "var(--shadow-soft)" }}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Views & Reach
        </p>
        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 rounded-full inline-block" style={{ background: "linear-gradient(90deg, #22d3ee, #a78bfa, #ec4899)" }} />
            Views
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 rounded-full inline-block bg-emerald-400" />
            Reach
          </span>
        </div>
      </div>

      {n === 0 ? (
        <div className="h-44 flex items-center justify-center text-sm text-slate-400">
          No data yet — run a sync to populate.
        </div>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" style={{ height: 176 }}>
          <defs>
            <linearGradient id="eng-line-grad" x1="0" x2="1">
              <stop offset="0" stopColor="#22d3ee" />
              <stop offset="0.5" stopColor="#a78bfa" />
              <stop offset="1" stopColor="#ec4899" />
            </linearGradient>
            <linearGradient id="eng-area-grad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="rgba(167,139,250,0.28)" />
              <stop offset="1" stopColor="rgba(167,139,250,0)" />
            </linearGradient>
          </defs>

          {gridYs.map(({ y, label }) => (
            <g key={label}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y}
                stroke="rgba(15,23,42,0.06)" strokeDasharray="3 6" />
              <text x={PAD.l - 6} y={y + 4} textAnchor="end"
                style={{ fontSize: 9, fill: "#94a3b8", fontFamily: "system-ui" }}>
                {label}
              </text>
            </g>
          ))}

          {viewsArea && <path d={viewsArea} fill="url(#eng-area-grad)" />}
          {viewsLine && (
            <path
              d={viewsLine}
              stroke="url(#eng-line-grad)"
              strokeWidth="2.5"
              fill="none"
              strokeLinecap="round"
              strokeDasharray="1200"
              strokeDashoffset="1200"
              style={{ animation: "drawLine 2.2s ease-out 0.2s forwards" }}
            />
          )}
          {reachLine && (
            <path
              d={reachLine}
              stroke="#34d399"
              strokeWidth="1.75"
              fill="none"
              strokeLinecap="round"
              strokeDasharray="4 3"
              opacity="0.75"
            />
          )}

          {n > 0 && (
            <circle cx={xOf(n - 1)} cy={yOf(viewsData[n - 1]?.value ?? 0)} r="5" fill="#ec4899">
              <animate attributeName="r" values="5;8;5" dur="2.4s" repeatCount="indefinite" />
            </circle>
          )}

          {uniqueIdxs.map((i) => (
            <text
              key={i}
              x={xOf(i)}
              y={H - 4}
              textAnchor="middle"
              style={{ fontSize: 9, fill: "#94a3b8", fontFamily: "system-ui" }}
            >
              {fmtDate(viewsData[i]?.end_time ?? "")}
            </text>
          ))}
        </svg>
      )}
    </div>
  );
}
