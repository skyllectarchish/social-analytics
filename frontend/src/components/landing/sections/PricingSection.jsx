import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Check, Sparkles } from "lucide-react";
import GlassCard from "../ui/GlassCard";
import MagneticButton from "../ui/MagneticButton";
import SectionHeading from "../ui/SectionHeading";

const TIERS = [
  {
    name: "Free",
    price: "$0",
    cadence: "forever",
    description: "For new creators getting their feet wet.",
    cta: "Start free",
    features: [
      "Basic engagement analytics",
      "Trending audio tracker",
      "Community access",
      "1 connected IG account",
    ],
    accentBg: "",
    highlight: false,
  },
  {
    name: "Creator Pro",
    price: "$24",
    cadence: "/ month",
    description: "AI-powered insights for serious creators.",
    cta: "Go Pro",
    features: [
      "Real-time analytics suite",
      "AI growth recommendations",
      "Priority brand match",
      "Unlimited audio saves",
      "Advanced audience insights",
    ],
    accentBg:
      "bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white",
    highlight: true,
  },
  {
    name: "Brand Enterprise",
    price: "Custom",
    cadence: "talk to us",
    description: "Run global creator campaigns at scale.",
    cta: "Contact sales",
    features: [
      "Multi-creator campaign manager",
      "Unlimited brand seats",
      "Audit-grade reporting",
      "Dedicated success engineer",
      "Custom data integrations",
    ],
    accentBg: "",
    highlight: false,
  },
];

export default function PricingSection() {
  return (
    <section id="pricing" className="relative scroll-mt-24 py-16 sm:py-24">
      <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
        <SectionHeading
          eyebrow="Pricing"
          title={
            <>
              Plans that scale with your <span className="text-gradient">ambition</span>
            </>
          }
          description="Start free. Upgrade when AI begins doing the heavy lifting."
        />

        {/* Yearly toggle (visual only) */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="mt-7 flex items-center justify-center"
        >
          <div className="chip-soft inline-flex items-center gap-1 rounded-full p-1">
            <span className="rounded-full bg-[#0a0e27] px-4 py-1.5 text-[12px] font-semibold text-white">
              Monthly
            </span>
            <span className="rounded-full px-4 py-1.5 text-[12px] font-semibold text-slate-500">
              Yearly · save 30%
            </span>
          </div>
        </motion.div>

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {TIERS.map((tier, i) => (
            <motion.div
              key={tier.name}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-10% 0px" }}
              transition={{ duration: 0.6, delay: i * 0.1 }}
              whileHover={{ scale: 1.015 }}
              className={tier.highlight ? "lg:-mt-4" : ""}
            >
              {tier.highlight ? (
                <div className="relative h-full overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 p-7 text-white shadow-[0_30px_60px_-20px_rgba(167,139,250,0.55)]">
                  <div className="absolute -top-1 right-4 inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-violet-700 shadow-[0_8px_18px_-6px_rgba(167,139,250,0.5)]">
                    <Sparkles size={11} /> Most popular
                  </div>
                  <div className="font-display text-sm font-bold uppercase tracking-[0.18em] text-white/85">
                    {tier.name}
                  </div>
                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="font-display text-5xl font-semibold">
                      {tier.price}
                    </span>
                    <span className="text-sm text-white/80">{tier.cadence}</span>
                  </div>
                  <p className="mt-2 text-sm text-white/85">{tier.description}</p>

                  <div className="my-6 h-px bg-white/25" />

                  <ul className="space-y-2.5 text-sm">
                    {tier.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5">
                        <span className="mt-0.5 grid h-4 w-4 place-items-center rounded-full bg-white/25 text-white">
                          <Check size={10} strokeWidth={3} />
                        </span>
                        {f}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-7">
                    <Link
                      to="/register"
                      className="inline-flex w-full items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-[#0a0e27] shadow-[0_10px_24px_-8px_rgba(167,139,250,0.45)] transition hover:bg-zinc-100"
                    >
                      {tier.cta}
                    </Link>
                  </div>
                </div>
              ) : (
                <GlassCard className="h-full p-7" tilt={false}>
                  <div className="font-display text-sm font-bold uppercase tracking-[0.18em] text-slate-500">
                    {tier.name}
                  </div>
                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="font-display text-5xl font-semibold text-[#0a0e27]">
                      {tier.price}
                    </span>
                    <span className="text-sm text-slate-500">{tier.cadence}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{tier.description}</p>

                  <div className="my-6 h-px bg-slate-200" />

                  <ul className="space-y-2.5 text-sm text-slate-700">
                    {tier.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5">
                        <span className="mt-0.5 grid h-4 w-4 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                          <Check size={10} strokeWidth={3} />
                        </span>
                        {f}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-7">
                    <MagneticButton
                      as={Link}
                      to="/register"
                      variant="ghost"
                      className="!w-full"
                    >
                      {tier.cta}
                    </MagneticButton>
                  </div>
                </GlassCard>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
