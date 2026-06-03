import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowUpRight, Bot, Play, Sparkles, Star } from "lucide-react";
import { fadeUp, stagger } from "../lib/motion";
import { avatar, heroAvatars } from "../data/mock";
import HeroMockup from "./HeroMockup";

export default function Hero() {
  return (
    <section id="top" className="aurora-scene grain relative overflow-hidden px-4 pb-24 pt-36">
      {/* drifting color blobs + dot grid */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div
          className="absolute -top-32 -left-24 h-[480px] w-[480px] rounded-full opacity-60 blur-3xl"
          style={{ background: "radial-gradient(circle, #c4b5fd, transparent 60%)", animation: "drift 22s ease-in-out infinite" }}
        />
        <div
          className="absolute top-20 -right-32 h-[520px] w-[520px] rounded-full opacity-50 blur-3xl"
          style={{ background: "radial-gradient(circle, #fbcfe8, transparent 60%)", animation: "drift 28s ease-in-out infinite reverse" }}
        />
        <div
          className="absolute bottom-0 left-1/3 h-[420px] w-[420px] rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(circle, #dbeafe, transparent 60%)", animation: "drift 32s ease-in-out infinite" }}
        />
      </div>

      <motion.div
        className="mx-auto max-w-6xl text-center"
        variants={stagger}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={fadeUp}>
          <span className="chip">
            <Sparkles className="h-3.5 w-3.5" /> New · Audience DNA 2.0 is live
          </span>
        </motion.div>

        <motion.h1
          variants={fadeUp}
          className="mx-auto mt-6 max-w-4xl text-5xl font-semibold leading-[1.05] tracking-tight md:text-7xl md:leading-[1.02]"
        >
          Instagram analytics that <span className="text-aurora">feel like art</span>,
          <br className="hidden md:block" />{" "}
          <span className="font-serif font-normal italic text-foreground/80">
            not a spreadsheet.
          </span>
        </motion.h1>

        <motion.p variants={fadeUp} className="mx-auto mt-6 max-w-2xl text-lg text-foreground/65">
          A premium dashboard for creators and brands. See the why behind every post
          — with AI that drafts your next one.
        </motion.p>

        <motion.div variants={fadeUp} className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link to="/dashboard" className="btn-glow">
            Open the dashboard <ArrowUpRight className="h-4 w-4" />
          </Link>
          <a href="#preview" className="chip !bg-white/80 cursor-pointer">
            <Play className="h-3.5 w-3.5" /> Watch the 90-sec tour
          </a>
        </motion.div>

        <motion.div
          variants={fadeUp}
          className="mt-6 flex items-center justify-center gap-2 text-xs text-foreground/55"
        >
          <div className="flex -space-x-2">
            {heroAvatars.map((n) => (
              <img key={n} src={avatar(n)} className="h-6 w-6 rounded-full border-2 border-white" alt="" />
            ))}
          </div>
          loved by 24,000+ creators · 4.9{" "}
          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
        </motion.div>
      </motion.div>

      {/* dashboard preview + floating cards */}
      <motion.div
        variants={fadeUp}
        initial="hidden"
        animate="show"
        transition={{ delay: 0.3 }}
        className="relative mx-auto mt-16 max-w-5xl"
      >
        <HeroMockup />

        <div className="absolute -left-6 top-12 hidden rotate-[-6deg] md:block">
          <div className="card-hairline px-3 py-2 text-xs">
            <span className="text-ig font-semibold">+12.1%</span> reach this week
          </div>
        </div>
        <div className="absolute -right-4 bottom-10 hidden rotate-[5deg] md:block">
          <div className="card-hairline flex items-center gap-2 px-3 py-2 text-xs">
            <Bot className="h-4 w-4 text-violet" /> AI suggests post @ 7:42pm
          </div>
        </div>
      </motion.div>
    </section>
  );
}
