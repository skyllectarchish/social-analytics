import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

export default function FinalCTA() {
  return (
    <section className="px-4 py-24">
      <div
        className="aurora-scene relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] p-12 text-center md:p-20"
        style={{ background: "linear-gradient(135deg, #1a0b2e 0%, #2d1b3d 100%)" }}
      >
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

        <h2 className="text-4xl font-semibold text-white md:text-6xl">
          Your account, <span className="text-aurora">decoded.</span>
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-white/70">
          Stop guessing. Start growing with the analytics tool creators actually love.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/dashboard" className="btn-glow">
            Open the dashboard <ArrowUpRight className="h-4 w-4" />
          </Link>
          <a
            href="#features"
            className="rounded-full border border-white/20 px-5 py-3 text-sm font-medium text-white hover:bg-white/10"
          >
            See features
          </a>
        </div>
      </div>
    </section>
  );
}
