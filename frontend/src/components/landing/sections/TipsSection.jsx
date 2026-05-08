import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, Bookmark, Clock } from "lucide-react";
import GlassCard from "../ui/GlassCard";
import SectionHeading from "../ui/SectionHeading";

const CATEGORIES = [
  "All",
  "Engagement Growth",
  "Brand Deals",
  "Instagram Algorithm",
  "Viral Reels",
  "Monetization",
];

const ARTICLES = [
  {
    category: "Viral Reels",
    title: "The 3-second hook framework that's driving 10x reach in 2026",
    excerpt:
      "Why pattern interrupts beat clever scripts — and the 4 hook structures top creators reuse weekly.",
    readTime: "6 min",
    accent: "from-fuchsia-500 to-pink-500",
    featured: true,
  },
  {
    category: "Brand Deals",
    title: "Pricing your first sponsorship without leaving money on the table",
    excerpt: "The CPM x engagement formula brands actually respect.",
    readTime: "5 min",
    accent: "from-cyan-500 to-indigo-500",
  },
  {
    category: "Instagram Algorithm",
    title: "What the 2026 ranking signals reward (and quietly demote)",
    excerpt: "We analyzed 12k posts to map the new behavior model.",
    readTime: "8 min",
    accent: "from-violet-500 to-fuchsia-500",
  },
  {
    category: "Engagement Growth",
    title: "Reply rituals: the 12-minute window that compounds your reach",
    excerpt: "Why the first hour of comments is everything now.",
    readTime: "4 min",
    accent: "from-emerald-500 to-cyan-500",
  },
  {
    category: "Monetization",
    title: "Five revenue streams creators with under 50K already use",
    excerpt: "Beyond brand deals — predictable income from a small audience.",
    readTime: "7 min",
    accent: "from-amber-500 to-pink-500",
  },
];

export default function TipsSection() {
  const [active, setActive] = useState("All");
  const filtered =
    active === "All" ? ARTICLES : ARTICLES.filter((a) => a.category === active);
  const featured = filtered.find((a) => a.featured) || filtered[0];
  const rest = filtered.filter((a) => a !== featured);

  return (
    <section id="tips" className="relative scroll-mt-24 py-16 sm:py-24">
      <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
        <SectionHeading
          eyebrow="Tips & playbooks"
          title={
            <>
              Strategy notes from <span className="text-gradient">top creators</span>
            </>
          }
          description="Tactical, data-backed guides on growth, algorithms, brand deals, and monetization — refreshed weekly."
        />

        <div className="mt-10 flex flex-wrap justify-center gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setActive(c)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                active === c
                  ? "bg-white text-[#0a0e27] shadow-[0_8px_18px_-8px_rgba(167,139,250,0.5)]"
                  : "glass text-slate-700 hover:text-[#0a0e27]"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {featured && (
            <motion.article
              key={featured.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="lg:col-span-2"
            >
              <GlassCard className="group h-full overflow-hidden p-0">
                <div className="relative aspect-[16/8] overflow-hidden">
                  <div className={`absolute inset-0 bg-gradient-to-br ${featured.accent}`} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                  <div className="absolute left-5 top-5 inline-flex items-center gap-2 rounded-full bg-white/25 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white backdrop-blur">
                    Featured · {featured.category}
                  </div>
                </div>
                <div className="p-6 sm:p-8">
                  <h3 className="font-display max-w-xl text-balance text-2xl font-semibold leading-tight text-[#0a0e27] sm:text-3xl">
                    {featured.title}
                  </h3>
                  <p className="mt-3 max-w-2xl text-sm text-slate-600">
                    {featured.excerpt}
                  </p>
                  <div className="mt-5 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
                      <Clock size={12} /> {featured.readTime} read
                    </div>
                    <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0a0e27] transition group-hover:gap-2.5">
                      Read playbook <ArrowUpRight size={14} />
                    </div>
                  </div>
                </div>
              </GlassCard>
            </motion.article>
          )}

          <div className="space-y-5">
            {rest.slice(0, 4).map((a, i) => (
              <motion.article
                key={a.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.55, delay: i * 0.08 }}
              >
                <GlassCard className="group p-5">
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-700">
                      {a.category}
                    </span>
                    <Bookmark
                      size={14}
                      className="text-slate-400 transition group-hover:text-[#0a0e27]"
                    />
                  </div>
                  <h4 className="mt-3 text-pretty text-base font-semibold leading-snug text-[#0a0e27]">
                    {a.title}
                  </h4>
                  <p className="mt-2 line-clamp-2 text-xs text-slate-500">{a.excerpt}</p>
                  <div className="mt-3 flex items-center gap-2 text-[10px] font-medium text-slate-500">
                    <Clock size={10} /> {a.readTime} read
                  </div>
                </GlassCard>
              </motion.article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
