import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, ArrowUpRight, Play, Sparkles, TrendingUp } from "lucide-react";
import MagneticButton from "../ui/MagneticButton";
import HeroCluster from "../hero/HeroCluster";

const TRUSTED_BRANDS = ["AURORA", "NORTHWAVE", "VANTA", "PRISM", "ECHO", "STELLARIS"];

export default function HeroSection() {
  return (
    <section className="relative isolate overflow-hidden pb-12 pt-24 sm:pb-16 sm:pt-28 lg:pt-32">
      {/* Hero-scoped grid pattern (very subtle) */}
      <div
        aria-hidden
        className="grid-pattern pointer-events-none absolute inset-0 -z-10 opacity-50"
      />

      <div className="mx-auto grid max-w-7xl items-center gap-10 px-6 md:grid-cols-2 md:gap-10 lg:gap-12 lg:px-10">
        {/* ─────────── LEFT — copy ─────────── */}
        <div>
          <motion.a
            href="#features"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="chip-soft group inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold transition hover:scale-[1.02]"
          >
            <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-violet-500 to-pink-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white shadow-[0_4px_12px_-4px_rgba(167,139,250,0.5)]">
              <Sparkles size={10} /> v2
            </span>
            <span className="font-tight text-slate-700">AI Brand Match · just shipped</span>
            <ArrowUpRight size={12} className="text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-[#0a0e27]" />
          </motion.a>

          {/* Editorial headline with italic accent on "influence" */}
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.85, delay: 0.1, ease: [0.2, 0.8, 0.2, 1] }}
            className="font-display mt-7 max-w-xl text-balance text-[clamp(2.5rem,5vw,4.25rem)] font-semibold leading-[0.96] tracking-[-0.045em] text-[#0a0e27]"
          >
            Grow your{" "}
            <span className="relative inline-block">
              <span
                className="font-italic text-[1.12em] font-medium leading-none"
                style={{
                  background:
                    "linear-gradient(115deg, #8b5cf6 0%, #a855f7 35%, #ec4899 70%, #fb923c 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                influence
              </span>
              <span
                aria-hidden
                className="absolute -inset-x-3 inset-y-1 -z-10 rounded-full opacity-50"
                style={{
                  background:
                    "radial-gradient(60% 60% at 50% 50%, rgba(196,181,253,0.55), transparent 70%)",
                  filter: "blur(24px)",
                }}
              />
            </span>
            <br />
            with brands that{" "}
            <span className="font-italic text-[1.04em] font-normal text-slate-600">actually fit</span>{" "}
            you.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.25 }}
            className="font-tight mt-6 max-w-md text-pretty text-[15.5px] font-light leading-[1.55] text-slate-600 sm:text-[16.5px]"
          >
            The all-in-one creator workspace for analytics, AI growth insights,
            and brand collaborations — designed for the social-first era.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.32 }}
            className="mt-7 flex flex-wrap items-center gap-3"
          >
            <MagneticButton
              as={Link}
              to="/register"
              variant="gradient"
              className="!px-6 !py-3.5 !text-[14.5px]"
            >
              Start free <ArrowRight size={15} />
            </MagneticButton>
            <MagneticButton
              as="a"
              href="#analytics"
              variant="ghost"
              className="!px-5 !py-3.5 !text-[14.5px]"
            >
              <Play size={13} fill="currentColor" />
              Watch tour · 90s
            </MagneticButton>
          </motion.div>

          {/* Trust line — avatars + count + free pill, all in one row */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.42 }}
            className="font-tight mt-7 flex flex-wrap items-center gap-x-4 gap-y-3 text-[13px] text-slate-500"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex -space-x-2">
                {[
                  "from-fuchsia-500 to-pink-500",
                  "from-indigo-500 to-violet-500",
                  "from-cyan-500 to-blue-500",
                  "from-amber-500 to-orange-500",
                  "from-emerald-500 to-teal-500",
                ].map((g, i) => (
                  <span
                    key={i}
                    className={`h-6 w-6 rounded-full bg-gradient-to-br ${g} ring-2 ring-white`}
                  />
                ))}
              </div>
              <span>
                <span className="font-semibold text-[#0a0e27]">180k+</span> creators ·{" "}
                <span className="font-semibold text-[#0a0e27]">3.2k</span> brands
              </span>
            </div>

            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200/70">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-1.5 w-1.5 animate-ping rounded-full bg-emerald-500/70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              <TrendingUp size={10} />
              <span className="font-tight">
                <strong>814</strong> online · <strong>+18.4%</strong> reach today
              </span>
            </span>
          </motion.div>

          {/* Compact brand strip */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.55 }}
            className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2"
          >
            <span className="script-accent text-[13px] text-slate-500">trusted by</span>
            {TRUSTED_BRANDS.map((b) => (
              <span
                key={b}
                className="font-display whitespace-nowrap text-[11px] font-bold tracking-[0.18em] text-slate-400"
              >
                {b}
              </span>
            ))}
          </motion.div>
        </div>

        {/* ─────────── RIGHT — composition cluster ─────────── */}
        <div className="md:col-start-2 md:justify-self-end w-full">
          <HeroCluster />
        </div>
      </div>
    </section>
  );
}
