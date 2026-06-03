import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";

// Centered frosted card on the aurora backdrop, shared by login + register.
export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: ReactNode;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="aurora-scene grain relative grid min-h-dvh place-items-center px-4 py-16">
      <div className="absolute inset-0 -z-10 overflow-hidden" aria-hidden>
        <div
          className="absolute -top-32 left-1/4 h-[420px] w-[420px] rounded-full opacity-50 blur-3xl"
          style={{ background: "radial-gradient(circle, #c4b5fd, transparent 60%)", animation: "drift 24s ease-in-out infinite" }}
        />
        <div
          className="absolute bottom-0 right-1/4 h-[420px] w-[420px] rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(circle, #fbcfe8, transparent 60%)", animation: "drift 30s ease-in-out infinite reverse" }}
        />
      </div>

      <div className="w-full max-w-sm">
        <Link to="/" className="mx-auto mb-6 flex w-fit items-center gap-2">
          <span className="bg-ig grid h-8 w-8 place-items-center rounded-lg text-white">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">InfluenceIQ</span>
        </Link>

        <div className="card-hairline p-7">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-foreground/60">{subtitle}</p>
          {children}
        </div>

        <p className="mt-5 text-center text-sm text-foreground/60">{footer}</p>
      </div>
    </div>
  );
}

export const inputClass =
  "mt-1 w-full rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-violet focus:ring-2 focus:ring-violet/30";
export const labelClass = "block text-xs font-medium text-foreground/70";
