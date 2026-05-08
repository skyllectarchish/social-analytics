import { motion } from "framer-motion";
import { Hash, MessageSquare, Sparkles, UserPlus } from "lucide-react";
import GlassCard from "../ui/GlassCard";
import SectionHeading from "../ui/SectionHeading";

const CHATS = [
  {
    name: "Yuki Tanaka",
    avatar: "from-fuchsia-500 to-pink-500",
    text: "Anyone want to co-create a fitness reel series this month?",
    time: "2m",
  },
  {
    name: "Marco Reyes",
    avatar: "from-cyan-500 to-indigo-500",
    text: "Just dropped a 90-second skit, hit 4M views — AMA on hooks 🔥",
    time: "11m",
  },
  {
    name: "Aria Chen",
    avatar: "from-violet-500 to-fuchsia-500",
    text: "Brand brief shared in #beauty-collab — 5 spots open this week.",
    time: "32m",
  },
];

const PROFILES = [
  { name: "Liv Santiago", niche: "Travel · 1.2M", color: "from-amber-500 to-pink-500" },
  { name: "Kai Romero", niche: "Tech · 480K", color: "from-cyan-500 to-blue-500" },
  { name: "Noor Khalid", niche: "Wellness · 320K", color: "from-emerald-500 to-teal-500" },
];

const TOPICS = [
  "#reels-algorithm",
  "#brand-deals",
  "#viral-hooks",
  "#monetization",
  "#community",
  "#ai-tools",
  "#content-batching",
];

export default function CommunityShowcase() {
  return (
    <section id="community" className="relative scroll-mt-24 py-16 sm:py-24">
      <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
        <SectionHeading
          eyebrow="Community"
          title={
            <>
              A network where creators{" "}
              <span className="text-gradient">build together</span>
            </>
          }
          description="Conversations, collabs, and discovery — all inside niche-tuned creator spaces with always-on AI matchmaking."
        />

        <div className="mt-12 grid gap-6 lg:grid-cols-12">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10% 0px" }}
            transition={{ duration: 0.6 }}
            className="lg:col-span-7"
          >
            <GlassCard className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <MessageSquare size={13} className="text-cyan-500" /> #creator-lounge
                </div>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                  814 online
                </span>
              </div>

              <div className="mt-5 space-y-4">
                {CHATS.map((c, i) => (
                  <motion.div
                    key={c.name}
                    initial={{ opacity: 0, x: -12 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.1 + i * 0.1, duration: 0.5 }}
                    className="flex items-start gap-3 rounded-2xl glass-subtle p-4 transition hover:translate-y-[-2px]"
                  >
                    <div
                      className={`grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br ${c.avatar} text-xs font-bold text-white shadow-[0_8px_18px_-6px_rgba(167,139,250,0.4)]`}
                    >
                      {c.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-semibold text-[#0a0e27]">
                          {c.name}
                        </span>
                        <span className="text-[10px] text-slate-400">{c.time}</span>
                      </div>
                      <p className="mt-0.5 text-sm text-slate-700">{c.text}</p>
                    </div>
                  </motion.div>
                ))}

                <div className="flex items-center gap-3 rounded-2xl px-4 py-2 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-500 [animation-delay:-0.2s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-500 [animation-delay:-0.1s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-500" />
                  </span>
                  3 creators are typing…
                </div>
              </div>
            </GlassCard>
          </motion.div>

          <div className="space-y-6 lg:col-span-5">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-10% 0px" }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              <GlassCard className="p-6">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Creators near you
                  </div>
                  <Sparkles size={13} className="text-amber-500" />
                </div>
                <div className="mt-4 space-y-3">
                  {PROFILES.map((p, i) => (
                    <motion.div
                      key={p.name}
                      initial={{ opacity: 0, x: 12 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.2 + i * 0.1, duration: 0.5 }}
                      className="flex items-center gap-3 rounded-xl glass-subtle p-3 transition hover:translate-y-[-2px]"
                    >
                      <div
                        className={`grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br ${p.color} text-xs font-bold text-white shadow-[0_8px_18px_-6px_rgba(167,139,250,0.4)]`}
                      >
                        {p.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-[#0a0e27]">{p.name}</div>
                        <div className="text-[11px] text-slate-500">{p.niche}</div>
                      </div>
                      <button className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-[#0a0e27] transition hover:bg-zinc-200">
                        <UserPlus size={11} /> Follow
                      </button>
                    </motion.div>
                  ))}
                </div>
              </GlassCard>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-10% 0px" }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <GlassCard className="p-6">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <Hash size={13} /> Trending topics
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {TOPICS.map((t, i) => (
                    <motion.span
                      key={t}
                      initial={{ opacity: 0, scale: 0.9 }}
                      whileInView={{ opacity: 1, scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.1 + i * 0.05 }}
                      className="rounded-full glass px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:text-[#0a0e27]"
                    >
                      {t}
                    </motion.span>
                  ))}
                </div>
              </GlassCard>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
