import { motion } from "framer-motion";
import { Compass, Rocket, UserCircle2 } from "lucide-react";
import GlassCard from "../ui/GlassCard";
import SectionHeading from "../ui/SectionHeading";

const STEPS = [
  {
    icon: UserCircle2,
    label: "01",
    title: "Create your profile",
    description:
      "Connect Instagram in seconds. We pull your reach, audience, and signature aesthetic into a creator passport.",
    accent: "from-indigo-500 to-violet-500",
  },
  {
    icon: Compass,
    label: "02",
    title: "Discover opportunities",
    description:
      "AI matchmaking surfaces brand collabs, trending audio, and community spaces aligned to your niche.",
    accent: "from-violet-500 to-fuchsia-500",
  },
  {
    icon: Rocket,
    label: "03",
    title: "Grow engagement & revenue",
    description:
      "Ship campaigns, ride trends, and unlock recurring revenue — guided by real-time AI growth insights.",
    accent: "from-fuchsia-500 to-pink-500",
  },
];

export default function HowItWorks() {
  return (
    <section className="relative py-16 sm:py-24">
      <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
        <SectionHeading
          eyebrow="How it works"
          title={
            <>
              Three steps to your <span className="text-gradient">next breakthrough</span>
            </>
          }
        />

        <div className="relative mt-14">
          <svg
            aria-hidden
            viewBox="0 0 1200 60"
            className="absolute left-0 right-0 top-12 mx-auto hidden h-[60px] w-full max-w-5xl lg:block"
          >
            <defs>
              <linearGradient id="step-line" x1="0" x2="1">
                <stop offset="0" stopColor="#6366f1" />
                <stop offset="0.5" stopColor="#a78bfa" />
                <stop offset="1" stopColor="#ec4899" />
              </linearGradient>
              <filter id="step-glow">
                <feGaussianBlur stdDeviation="4" />
              </filter>
            </defs>
            <path
              d="M120 30 C 320 -10, 520 70, 720 30 S 1080 -10, 1080 30"
              stroke="url(#step-line)"
              strokeWidth="2"
              fill="none"
              filter="url(#step-glow)"
              opacity="0.5"
              strokeDasharray="2400"
              strokeDashoffset="2400"
              style={{ animation: "drawLine 3s ease-out 0.4s forwards" }}
            />
            <path
              d="M120 30 C 320 -10, 520 70, 720 30 S 1080 -10, 1080 30"
              stroke="url(#step-line)"
              strokeWidth="1.5"
              fill="none"
              strokeDasharray="2400"
              strokeDashoffset="2400"
              style={{ animation: "drawLine 3s ease-out 0.4s forwards" }}
            />
          </svg>

          <div className="grid gap-8 lg:grid-cols-3">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <motion.div
                  key={s.label}
                  initial={{ opacity: 0, y: 28 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-10% 0px" }}
                  transition={{ duration: 0.6, delay: 0.2 + i * 0.15 }}
                  className="relative"
                >
                  <div className="flex justify-center">
                    <div
                      className={`relative grid h-24 w-24 place-items-center rounded-full bg-gradient-to-br ${s.accent} shadow-[0_18px_42px_-12px_rgba(167,139,250,0.55)]`}
                    >
                      <span
                        aria-hidden
                        className="absolute inset-0 -z-10 rounded-full"
                        style={{
                          background:
                            "radial-gradient(circle, rgba(167,139,250,0.5), transparent 70%)",
                          filter: "blur(20px)",
                          animation: "pulseGlow 6s ease-in-out infinite",
                        }}
                      />
                      <Icon size={28} className="text-[#0a0e27]" />
                    </div>
                  </div>
                  <GlassCard className="mt-6 p-6 text-center">
                    <div className="font-display text-[10px] font-bold tracking-[0.32em] text-slate-500">
                      STEP {s.label}
                    </div>
                    <h3 className="font-display mt-2 text-xl font-semibold text-[#0a0e27]">
                      {s.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.description}</p>
                  </GlassCard>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
