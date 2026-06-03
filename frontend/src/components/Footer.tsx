import { Instagram, Sparkles } from "lucide-react";
import { footerColumns } from "../data/mock";

export default function Footer() {
  return (
    <footer className="border-t border-black/5 px-4 py-12">
      <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-5">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2">
            <div className="bg-ig grid h-7 w-7 place-items-center rounded-lg text-white">
              <Sparkles className="h-4 w-4" />
            </div>
            <span className="font-display text-lg font-semibold">InfluenceIQ</span>
          </div>
          <p className="mt-3 max-w-xs text-sm text-foreground/55">
            Premium Instagram analytics. Built in Lisbon for the creator economy.
          </p>
          <div className="mt-4 flex gap-2">
            <Instagram className="h-4 w-4 text-foreground/50" />
          </div>
        </div>

        {footerColumns.map((col) => (
          <div key={col.title}>
            <div className="text-xs font-semibold uppercase tracking-wider text-foreground/55">
              {col.title}
            </div>
            <ul className="mt-3 space-y-2 text-sm text-foreground/70">
              {col.links.map((l) => (
                <li key={l}>
                  <a className="hover:text-foreground" href="#">
                    {l}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mx-auto mt-10 flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-black/5 pt-6 text-xs text-foreground/55">
        <span>© 2026 InfluenceIQ Labs · Made with 💜 in Lisbon</span>
        <span>Privacy · Terms · Cookies</span>
      </div>
    </footer>
  );
}
