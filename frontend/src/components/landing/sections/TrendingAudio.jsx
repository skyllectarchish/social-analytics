import { motion } from "framer-motion";
import { Bookmark, Music2, TrendingUp } from "lucide-react";
import GlassCard from "../ui/GlassCard";
import SectionHeading from "../ui/SectionHeading";

const AUDIOS = [
  {
    title: "Sunset Drift",
    artist: "lov.ren",
    growth: "+312%",
    uses: "184K",
    velocity: "Volcanic",
    accent: "from-fuchsia-500 to-pink-500",
  },
  {
    title: "Midnight Static",
    artist: "ÆON",
    growth: "+248%",
    uses: "92K",
    velocity: "Surging",
    accent: "from-indigo-500 to-violet-500",
  },
  {
    title: "Chrome Velvet",
    artist: "Halowave",
    growth: "+196%",
    uses: "76K",
    velocity: "Surging",
    accent: "from-cyan-500 to-indigo-500",
  },
  {
    title: "Slow Bloom",
    artist: "Mira K.",
    growth: "+148%",
    uses: "61K",
    velocity: "Rising",
    accent: "from-emerald-500 to-cyan-500",
  },
];

export default function TrendingAudio() {
  return (
    <section className="relative py-16 sm:py-24">
      <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
        <SectionHeading
          eyebrow="Trending audio"
          title={
            <>
              Catch the wave <span className="text-gradient">before it breaks</span>
            </>
          }
          description="Track Reels audio velocity, save what fits your aesthetic, and time your posts when the trend is still climbing."
        />

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {AUDIOS.map((a, i) => (
            <motion.div
              key={a.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-10% 0px" }}
              transition={{ duration: 0.55, delay: i * 0.07 }}
            >
              <GlassCard className="group h-full overflow-hidden p-0">
                <div className="relative aspect-[5/3] overflow-hidden">
                  <div className={`absolute inset-0 bg-gradient-to-br ${a.accent}`} />
                  <div className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/25 px-2 py-1 text-[10px] font-semibold text-[#0a0e27] backdrop-blur">
                    <TrendingUp size={10} className="text-emerald-200" />
                    {a.velocity}
                  </div>
                  <div className="absolute right-3 top-3 rounded-full bg-emerald-400/90 px-2 py-1 text-[10px] font-bold text-[#0a0e27] backdrop-blur">
                    {a.growth}
                  </div>

                  <div className="absolute inset-x-0 bottom-0 flex items-end justify-center gap-0.5 px-4 pb-3">
                    {Array.from({ length: 32 }).map((_, idx) => (
                      <span
                        key={idx}
                        className="audio-bar w-0.5 rounded-full bg-white/95"
                        style={{
                          height: `${8 + ((idx * 11) % 36)}px`,
                          animationDelay: `${idx * 50}ms`,
                          animationDuration: `${1 + (idx % 5) * 0.15}s`,
                        }}
                      />
                    ))}
                  </div>
                </div>

                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        <Music2 size={11} /> Reel audio
                      </div>
                      <div className="mt-1 font-display text-base font-semibold text-[#0a0e27]">
                        {a.title}
                      </div>
                      <div className="text-[11px] text-slate-500">{a.artist}</div>
                    </div>
                    <button
                      className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-white hover:text-[#0a0e27]"
                      aria-label="Save audio"
                    >
                      <Bookmark size={14} />
                    </button>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">{a.uses} uses</span>
                    <span className="font-semibold text-emerald-700">Save audio →</span>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
