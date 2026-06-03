import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Check, TrendingUp } from "lucide-react";
import { Reveal } from "./ui/Reveal";
import GlassTooltip from "./charts/GlassTooltip";
import { PALETTE, storyArea, storyPoints } from "../data/mock";

export default function ChartsStory() {
  return (
    <section id="preview" className="px-4 py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-10 md:grid-cols-2">
        <Reveal>
          <span className="chip">Live preview</span>
          <h2 className="mt-4 text-4xl font-semibold md:text-5xl">
            Charts that <span className="text-aurora">tell a story.</span>
          </h2>
          <p className="mt-3 text-foreground/65">
            Every metric is paired with the why — annotated spikes, content overlays,
            and AI-summarized takeaways so you actually understand what changed.
          </p>
          <ul className="mt-6 space-y-2 text-sm">
            {storyPoints.map((p) => (
              <li key={p} className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 text-violet" />
                {p}
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal>
          <div className="card-hairline p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-foreground/55">Followers · last 30 days</div>
                <div className="num text-2xl font-semibold">
                  184,320 <span className="text-sm text-emerald-600">+3.4%</span>
                </div>
              </div>
              <div className="chip">
                <TrendingUp className="h-3.5 w-3.5" /> trending
              </div>
            </div>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={storyArea} margin={{ top: 8, right: 6, bottom: 0, left: -16 }}>
                  <defs>
                    <linearGradient id="storyFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={PALETTE.violet} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={PALETTE.violet} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="storyStroke" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={PALETTE.violet} />
                      <stop offset="100%" stopColor={PALETTE.pink} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={PALETTE.grid} vertical={false} />
                  <XAxis dataKey="d" tick={{ fontSize: 10, fill: PALETTE.muted }} tickLine={false} axisLine={false} interval={5} />
                  <YAxis tick={{ fontSize: 10, fill: PALETTE.muted }} tickLine={false} axisLine={false} width={40} />
                  <Tooltip cursor={{ stroke: PALETTE.violet, strokeWidth: 1 }} content={<GlassTooltip labelText="Day" />} />
                  <Area
                    type="monotone"
                    dataKey="v"
                    stroke="url(#storyStroke)"
                    strokeWidth={2.5}
                    fill="url(#storyFill)"
                    dot={false}
                    activeDot={{ r: 4, fill: PALETTE.pink, strokeWidth: 0 }}
                    animationDuration={1100}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
