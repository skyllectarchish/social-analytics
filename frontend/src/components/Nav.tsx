import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import Logo from "./ui/Logo";

const LINKS = [
  { label: "Features", href: "#features" },
  { label: "Product", href: "#preview" },
  { label: "Pricing", href: "#pricing" },
  { label: "Community", href: "#community" },
];

export default function Nav() {
  return (
    <header className="fixed inset-x-0 top-3 z-50 flex justify-center px-4">
      <nav className="glass-strong flex w-full max-w-5xl items-center justify-between rounded-full px-4 py-2.5">
        <Logo />

        <div className="hidden items-center gap-7 text-sm text-foreground/70 md:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="hover:text-foreground">
              {l.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className="hidden text-sm font-medium text-foreground/80 hover:text-foreground sm:inline"
          >
            Sign in
          </Link>
          <Link to="/dashboard" className="btn-glow !py-2 !px-4 text-sm">
            Open app <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </nav>
    </header>
  );
}
