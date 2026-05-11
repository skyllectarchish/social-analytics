import { useState } from "react";
import { motion } from "framer-motion";
import { useDemographics } from "../../hooks/useInsights";
import GenderDonut from "./GenderDonut";

const BREAKDOWNS = ["age", "gender", "city", "country"];

const BAR_GRADIENTS = [
  "from-violet-400 to-purple-500",
  "from-pink-400 to-rose-500",
  "from-sky-400 to-blue-500",
  "from-emerald-400 to-teal-500",
  "from-amber-400 to-orange-500",
  "from-fuchsia-400 to-violet-500",
  "from-cyan-400 to-sky-500",
  "from-rose-400 to-pink-500",
];

function BarChart({ data }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const sorted = [...data].sort((a, b) => b.value - a.value).slice(0, 10);

  return (
    <div className="space-y-3">
      {sorted.map((d, i) => {
        const pct = ((d.value / total) * 100).toFixed(1);
        return (
          <div key={d.dimension_value}>
            <div className="flex items-center justify-between text-[11px] font-medium text-slate-700 mb-1">
              <span className="truncate max-w-[60%]">{d.dimension_value}</span>
              <span className="text-slate-500 tabular-nums">{pct}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <motion.div
                initial={{ width: 0 }}
                whileInView={{ width: `${pct}%` }}
                viewport={{ once: true }}
                transition={{ duration: 1.1, delay: 0.1 + i * 0.06, ease: [0.2, 0.8, 0.2, 1] }}
                className={`h-full rounded-full bg-gradient-to-r ${BAR_GRADIENTS[i % BAR_GRADIENTS.length]}`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SkeletonBars() {
  return (
    <div className="space-y-3 animate-pulse">
      {[70, 85, 45, 55, 30].map((w, i) => (
        <div key={i}>
          <div className="flex justify-between mb-1">
            <div className="h-3 rounded bg-slate-200" style={{ width: `${w * 0.6}px` }} />
            <div className="h-3 w-8 rounded bg-slate-200" />
          </div>
          <div className="h-1.5 rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-slate-200" style={{ width: `${w}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function DemographicsPanel() {
  const [breakdown, setBreakdown] = useState("age");
  const [metric, setMetric] = useState("follower_demographics");

  const { data, loading, error } = useDemographics(metric, breakdown);

  return (
    <div className="glass rounded-2xl p-5" style={{ boxShadow: "var(--shadow-soft)" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Demographics
        </p>
        <div className="chip-soft flex items-center gap-1 rounded-lg p-0.5 text-[10px]">
          {["follower_demographics", "engaged_audience_demographics"].map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`px-2 py-1 rounded-md font-semibold transition-all ${
                metric === m ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"
              }`}
            >
              {m === "follower_demographics" ? "Followers" : "Engaged"}
            </button>
          ))}
        </div>
      </div>

      {/* Breakdown tabs */}
      <div className="flex gap-1 mb-5">
        {BREAKDOWNS.map((b) => (
          <button
            key={b}
            onClick={() => setBreakdown(b)}
            className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold capitalize transition-all ${
              breakdown === b
                ? "text-white"
                : "text-slate-500 hover:text-[#0a0e27] hover:bg-slate-50"
            }`}
            style={
              breakdown === b
                ? { background: "linear-gradient(135deg, #8b5cf6, #ec4899)" }
                : {}
            }
          >
            {b}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <SkeletonBars />
      ) : error || !data?.data?.length ? (
        <div className="py-6 text-center text-sm text-slate-400">
          {error || "No data — run a sync first."}
        </div>
      ) : breakdown === "gender" ? (
        <GenderDonut data={data.data} />
      ) : (
        <BarChart data={data.data} />
      )}
    </div>
  );
}
