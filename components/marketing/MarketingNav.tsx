"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { MagneticButton } from "./MagneticButton";

const LINKS = [
  { href: "/pricing", label: "Pricing" },
  { href: "/blog", label: "Blog" },
  { href: "/login", label: "Sign in" },
];

export function MarketingNav() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4">
      <div
        className={`w-full max-w-6xl rounded-2xl border transition-all duration-500 ${
          scrolled
            ? "max-w-[860px] border-neutral-200/70 bg-white/70 px-2 py-2 shadow-[0_1px_2px_rgba(11,10,13,0.04),0_6px_16px_-8px_rgba(11,10,13,0.1)] backdrop-blur-xl dark:border-neutral-800/70 dark:bg-neutral-950/70"
            : "border-transparent px-2 py-3"
        }`}
      >
        <div className="flex items-center justify-between px-2">
          <Link href="/" onClick={() => setOpen(false)}>
            <Logo markSize={22} className="text-[15px]" />
          </Link>

          <nav className="hidden items-center gap-7 text-sm sm:flex">
            {LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative py-1 transition-colors ${
                    active
                      ? "text-neutral-900 dark:text-white"
                      : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                  }`}
                >
                  {link.label}
                  {active && (
                    <span
                      className="absolute -bottom-1 left-0 right-0 h-px"
                      style={{ background: "var(--brand-gradient)" }}
                    />
                  )}
                </Link>
              );
            })}
            <ThemeToggle />
            <MagneticButton>
              <Link
                href="/signup"
                className="inline-block rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
              >
                Get started
              </Link>
            </MagneticButton>
          </nav>

          <div className="flex items-center gap-2 sm:hidden">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="rounded-md p-2 text-neutral-700 dark:text-neutral-300"
              aria-label="Toggle menu"
            >
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {open && (
            <motion.nav
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden sm:hidden"
            >
              <div className="mt-2 flex flex-col gap-1 border-t border-neutral-200/70 px-2 pt-3 text-sm dark:border-neutral-800/70">
                {LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="rounded-md px-2 py-2.5 text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-900"
                  >
                    {link.label}
                  </Link>
                ))}
                <Link
                  href="/signup"
                  onClick={() => setOpen(false)}
                  className="mt-2 rounded-lg bg-neutral-900 px-4 py-2.5 text-center text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
                >
                  Get started
                </Link>
              </div>
            </motion.nav>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
