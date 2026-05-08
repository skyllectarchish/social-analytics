import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import MagneticButton from "../ui/MagneticButton";

export default function CTASection() {
  return (
    <section className="relative py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10% 0px" }}
          transition={{ duration: 0.7 }}
          className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-10 text-white shadow-[0_40px_80px_-30px_rgba(139,92,246,0.55)] sm:p-16"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-50"
            style={{
              background:
                "radial-gradient(50% 60% at 30% 30%, rgba(255,255,255,0.18), transparent 60%), radial-gradient(45% 60% at 80% 70%, rgba(244,114,182,0.45), transparent 60%), radial-gradient(50% 60% at 60% 100%, rgba(34,211,238,0.35), transparent 60%)",
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-10 top-0 divider-glow"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-10 bottom-0 divider-glow"
          />

          <div className="relative mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white backdrop-blur">
              <Sparkles size={11} className="text-amber-200" /> Join 180K+ creators
            </div>
            <h2 className="font-display mt-6 text-balance text-[clamp(2.5rem,6vw,4.5rem)] font-semibold leading-[0.98] tracking-[-0.045em]">
              Turn engagement into{" "}
              <span className="bg-gradient-to-r from-amber-200 via-pink-100 to-cyan-100 bg-clip-text text-transparent">
                opportunities
              </span>
            </h2>
            <p className="font-body mx-auto mt-6 max-w-2xl text-[17px] leading-[1.55] text-white/85 sm:text-lg">
              Step into the creator ecosystem built for the next decade of social.
              Real analytics, real collabs, real growth — no fluff.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/register"
                className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-[#0a0e27] shadow-[0_12px_28px_-10px_rgba(0,0,0,0.35)] transition hover:-translate-y-0.5 hover:bg-slate-100"
              >
                Join the Creator Ecosystem <ArrowRight size={16} />
              </Link>
              <a
                href="#features"
                className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/10 px-6 py-3.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
              >
                See how it works
              </a>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
