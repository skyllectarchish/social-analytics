import { Check } from "lucide-react";
import { Link } from "react-router-dom";
import { Reveal, RevealItem } from "./ui/Reveal";
import { pricing } from "../data/mock";

export default function Pricing() {
  return (
    <section id="pricing" className="px-4 py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="chip">Pricing</span>
          <h2 className="mt-4 text-4xl font-semibold md:text-5xl">
            Simple, <span className="font-serif italic">creator-friendly.</span>
          </h2>
          <p className="mt-3 text-foreground/60">
            No usage limits on the Creator plan. Cancel anytime.
          </p>
        </Reveal>

        <Reveal group className="mt-12 grid items-stretch gap-5 md:grid-cols-3">
          {pricing.map((tier) => (
            <RevealItem key={tier.name} className={tier.popular ? "md:-mt-4" : ""}>
              <div className="relative h-full">
                {tier.popular && (
                  <div className="absolute inset-0 -z-10 rounded-[1.5rem] bg-gradient-to-br from-violet/40 via-pink-300/40 to-amber-200/40 blur-2xl" />
                )}
                <div
                  className={`card-hairline flex h-full flex-col p-7 ${
                    tier.popular ? "ring-2 ring-violet/30" : ""
                  }`}
                >
                  {tier.popular && (
                    <span className="chip mb-3 self-start !bg-ink !text-white">
                      Most popular
                    </span>
                  )}
                  <div className="text-sm font-medium text-foreground/60">{tier.name}</div>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="num text-5xl font-semibold tracking-tight">
                      ${tier.price}
                    </span>
                    <span className="text-sm text-foreground/55">/ {tier.cadence}</span>
                  </div>

                  <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                    {tier.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 text-violet" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  {tier.popular ? (
                    <Link to="/register" className="btn-glow mt-7">
                      {tier.cta}
                    </Link>
                  ) : (
                    <Link
                      to="/register"
                      className="mt-7 inline-flex justify-center rounded-full border border-ink/15 px-4 py-2.5 text-sm font-medium transition hover:bg-ink hover:text-white"
                    >
                      {tier.cta}
                    </Link>
                  )}
                </div>
              </div>
            </RevealItem>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
