import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, Sparkles, X } from "lucide-react";
import MagneticButton from "../ui/MagneticButton";

const NAV_ITEMS = [
  { label: "Features", href: "#features" },
  { label: "Analytics", href: "#analytics" },
  { label: "Community", href: "#community" },
  { label: "Pricing", href: "#pricing" },
  { label: "Tips", href: "#tips" },
];

export default function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <motion.header
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
          scrolled
            ? "border-b border-slate-200/70 bg-white/75 backdrop-blur-xl"
            : "bg-transparent"
        }`}
      >
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-10">
          <Link to="/" className="group flex items-center gap-2.5">
            <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-[0_8px_20px_-6px_rgba(167,139,250,0.55)]">
              <Sparkles className="text-white" size={18} />
            </span>
            <span className="font-display text-[1.05rem] font-semibold tracking-[-0.03em] text-[#0a0e27]">
              Lumen<span className="text-gradient-cool">.io</span>
            </span>
          </Link>

          <ul className="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => (
              <li key={item.label}>
                <a
                  href={item.href}
                  className="relative rounded-full px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-[#0a0e27]"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="hidden items-center gap-3 md:flex">
            <Link
              to="/login"
              className="text-sm font-medium text-slate-600 transition hover:text-[#0a0e27]"
            >
              Sign in
            </Link>
            <MagneticButton as={Link} to="/register" variant="gradient" className="!px-5 !py-2.5">
              Get Started
            </MagneticButton>
          </div>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="grid h-10 w-10 place-items-center rounded-full glass text-[#0a0e27] md:hidden"
            aria-label="Toggle menu"
            aria-expanded={open}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </nav>
      </motion.header>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-white/80 backdrop-blur-xl md:hidden"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
              className="mx-auto mt-24 max-w-md px-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="rounded-3xl glass-strong p-6">
                <ul className="flex flex-col gap-1">
                  {NAV_ITEMS.map((item, i) => (
                    <motion.li
                      key={item.label}
                      initial={{ x: -20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: 0.05 * i, duration: 0.3 }}
                    >
                      <a
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className="block rounded-xl px-4 py-3 text-base font-medium text-slate-800 transition hover:bg-slate-100 hover:text-[#0a0e27]"
                      >
                        {item.label}
                      </a>
                    </motion.li>
                  ))}
                </ul>
                <div className="my-5 divider-glow" />
                <div className="flex flex-col gap-3">
                  <Link
                    to="/login"
                    onClick={() => setOpen(false)}
                    className="rounded-full glass px-5 py-3 text-center text-sm font-medium text-slate-800"
                  >
                    Sign in
                  </Link>
                  <MagneticButton
                    as={Link}
                    to="/register"
                    onClick={() => setOpen(false)}
                    className="!w-full"
                  >
                    Get Started
                  </MagneticButton>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
