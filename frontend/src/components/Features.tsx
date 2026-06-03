import {
  BarChart3,
  Bot,
  ChevronRight,
  Heart,
  Play,
  UsersRound,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Reveal, RevealItem } from "./ui/Reveal";
import { features } from "../data/mock";

const ICONS: Record<string, LucideIcon> = {
  UsersRound,
  Zap,
  Heart,
  Play,
  BarChart3,
  Bot,
};

export default function Features() {
  return (
    <section id="features" className="px-4 py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="chip">Features</span>
          <h2 className="mt-4 text-4xl font-semibold md:text-5xl">
            Six modules. <span className="font-serif italic">One source of truth.</span>
          </h2>
          <p className="mt-3 text-foreground/60">
            Built from the ground up for Instagram — not retrofitted from a generic
            analytics tool.
          </p>
        </Reveal>

        <Reveal group className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => {
            const Icon = ICONS[f.icon];
            return (
              <RevealItem key={f.title}>
                <div className="card-hairline h-full p-6">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-lavender text-violet-deep">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-xl font-semibold tracking-tight">{f.title}</h3>
                  <p className="mt-2 text-sm text-foreground/65">{f.body}</p>
                  <div className="mt-4 text-xs font-medium text-violet-deep">
                    Learn more <ChevronRight className="inline h-3 w-3" />
                  </div>
                </div>
              </RevealItem>
            );
          })}
        </Reveal>
      </div>
    </section>
  );
}
