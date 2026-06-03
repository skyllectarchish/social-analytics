import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import { avatar, dashArea, dashMetrics, dashSidebar, PALETTE } from "../data/mock";
import GlassTooltip from "./charts/GlassTooltip";

export default function HeroMockup() {
  return (
    <div className="card-hairline overflow-hidden p-3 md:p-4">
      {/* browser chrome */}
      <div className="flex items-center justify-between rounded-xl bg-[#f5f6fa] px-4 py-2 text-xs text-foreground/55">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
        </div>
        <span className="num">influenceiq.app/overview</span>
        <span>⌘K</span>
      </div>

      <div className="grid grid-cols-12 gap-3 p-3">
        {/* sidebar */}
        <div className="col-span-3 hidden flex-col gap-2 rounded-xl bg-white p-3 text-left md:flex">
          <div className="flex items-center gap-2 px-2 pb-2">
            <img src={avatar(47)} className="h-7 w-7 rounded-full" alt="" />
            <div className="text-xs">
              <div className="font-semibold">@maya.creates</div>
              <div className="text-foreground/50">Creator</div>
            </div>
          </div>
          {dashSidebar.map((item, i) => (
            <div
              key={item}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${
                i === 0 ? "bg-[#ede9fe] text-[#4c1d95]" : "text-foreground/70"
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
              {item}
            </div>
          ))}
        </div>

        {/* main */}
        <div className="col-span-12 md:col-span-9">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {dashMetrics.map((m) => (
              <div key={m.label} className="rounded-xl bg-white p-3 text-left ring-1 ring-black/5">
                <div className="text-[10px] uppercase tracking-wider text-foreground/50">
                  {m.label}
                </div>
                <div className="num mt-1 text-lg font-semibold">{m.value}</div>
                <div className="mt-0.5 text-[10px] text-emerald-600">{m.delta}</div>
              </div>
            ))}
          </div>

          <div className="mt-3 h-44 rounded-xl bg-white p-3 ring-1 ring-black/5">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dashArea} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
                <defs>
                  <linearGradient id="heroFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={PALETTE.violet} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={PALETTE.violet} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="d" hide />
                <Tooltip cursor={{ stroke: PALETTE.violet, strokeWidth: 1 }} content={<GlassTooltip unit="K" />} />
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={PALETTE.primary}
                  strokeWidth={2.5}
                  fill="url(#heroFill)"
                  dot={false}
                  activeDot={{ r: 4, fill: PALETTE.primary, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
