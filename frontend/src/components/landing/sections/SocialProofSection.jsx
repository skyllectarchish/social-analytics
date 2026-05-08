import { motion } from "framer-motion";
import { Quote, Star } from "lucide-react";
import GlassCard from "../ui/GlassCard";

const BRANDS = [
  "AURORA",
  "NORTHWAVE",
  "VANTA",
  "PRISM·CO",
  "ECHO LABS",
  "OBSIDIAN",
  "HALOWEAR",
  "STELLARIS",
  "NEBULA",
  "MIDNIGHT",
];

const TESTIMONIALS = [
  {
    name: "Mira Okafor",
    handle: "@miraokafor",
    role: "Lifestyle creator · 1.2M",
    avatar: "from-fuchsia-500 to-pink-500",
    quote:
      "Lumen turned my analytics into a story I can actually act on. My reels reach grew 4x in two months.",
    rating: 5,
  },
  {
    name: "Devin Park",
    handle: "@devinparkco",
    role: "Tech reviewer · 480K",
    avatar: "from-cyan-500 to-indigo-500",
    quote:
      "The AI insights nudge me before posting — best time, best caption length, even hooks. It just works.",
    rating: 5,
  },
  {
    name: "Sofia Almeida",
    handle: "@sofiaalmeida",
    role: "Travel creator · 870K",
    avatar: "from-violet-500 to-fuchsia-500",
    quote:
      "I matched with three brands in my first week. The collab hub feels like a creator's dream agent.",
    rating: 5,
  },
];

export default function SocialProofSection() {
  return (
    <section className="relative py-14 sm:py-20">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-15% 0px" }}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">
            Trusted by 180,000+ creators & brands worldwide
          </p>
        </motion.div>

        {/* Marquee */}
        <div className="relative mt-10 overflow-hidden">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-32 bg-gradient-to-r from-[#fafafb] to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-32 bg-gradient-to-l from-[#fafafb] to-transparent" />
          <div
            className="flex w-max gap-3"
            style={{ animation: "marquee 32s linear infinite" }}
          >
            {[...BRANDS, ...BRANDS].map((b, i) => (
              <div
                key={`${b}-${i}`}
                className="rounded-2xl glass px-7 py-4 text-sm font-bold tracking-[0.22em] text-slate-700"
              >
                {b}
              </div>
            ))}
          </div>
        </div>

        {/* Testimonials */}
        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {TESTIMONIALS.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-15% 0px" }}
              transition={{ duration: 0.6, delay: i * 0.1 }}
            >
              <GlassCard className="h-full p-6">
                <Quote className="text-violet-400" size={22} />
                <p className="mt-3 text-pretty text-sm leading-relaxed text-slate-700">
                  "{t.quote}"
                </p>
                <div className="mt-5 flex items-center gap-3">
                  <div
                    className={`grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br ${t.avatar} text-xs font-bold text-white shadow-[0_8px_18px_-6px_rgba(167,139,250,0.4)]`}
                  >
                    {t.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-[#0a0e27]">{t.name}</div>
                    <div className="text-[11px] text-slate-500">{t.role}</div>
                  </div>
                  <div className="flex">
                    {Array.from({ length: t.rating }).map((_, idx) => (
                      <Star
                        key={idx}
                        size={11}
                        className="fill-amber-400 text-amber-400"
                      />
                    ))}
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
