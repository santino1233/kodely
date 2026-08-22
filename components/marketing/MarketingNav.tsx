"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { ShineButton } from "./ShineButton";
import { useSignedIn } from "./useSignedIn";

const LINKS = [
  // Templates sits first deliberately: it is the answer to the empty prompt
  // box, which is the biggest drop-off in this category. A gallery nobody can
  // reach solves nothing — /templates previously existed with no link to it.
  { href: "/templates", label: "Templates" },
  { href: "/pricing", label: "Pricing" },
  { href: "/blog", label: "Blog" },
];

// The last nav link and the button beside it are the only two things on the
// marketing site that change with sign-in state. Offering "Sign in" to
// someone who is already signed in is the small daily lie this fixes; the
// signed-in pair replaces it with the two things that person actually wants
// from a marketing page — back into the product, or straight into a build.
const ACCOUNT_LINK = {
  out: { href: "/login", label: "Sign in" },
  in: { href: "/dashboard", label: "Portal" },
};
const CTA = {
  out: { href: "/signup", label: "Get started" },
  in: { href: "/dashboard/new", label: "Create website" },
};

/**
 * `signedIn` is passed by the marketing pages that are already rendered per
 * request, and left off by the ones that are statically prerendered.
 *
 * That split is the whole design, and it is worth stating plainly. Making
 * every marketing page dynamic to render two nav links would put a server
 * render (and a session lookup) in front of /pricing, /legal/* and every blog
 * post — the pages whose entire job is to be cheap, cacheable and indexed.
 * So the pages that were dynamic anyway hand the answer down and paint it
 * correctly the first time; the static ones resolve it in the browser from
 * the kodely_auth hint cookie and swap one paint later. The visible cost is
 * that flash, and it is confined to pages with no hero and no CTA above the
 * fold. See useSignedIn and lib/auth-cookies.
 */
export function MarketingNav({ signedIn }: { signedIn?: boolean }) {
  const isSignedIn = useSignedIn(signedIn);
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const links = [...LINKS, isSignedIn ? ACCOUNT_LINK.in : ACCOUNT_LINK.out];
  const cta = isSignedIn ? CTA.in : CTA.out;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Escape closes the mobile menu and hands focus back to the button that
  // opened it — without this, the only way out of the expanded menu from the
  // keyboard was to tab all the way through it.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4">
      <div
        className={`w-full max-w-7xl rounded-2xl border transition-all duration-500 ${
          scrolled
            ? "max-w-[860px] border-neutral-200/70 bg-white/70 px-2 py-2 shadow-[0_1px_2px_rgba(11,10,13,0.04),0_6px_16px_-8px_rgba(11,10,13,0.1)] backdrop-blur-xl dark:border-neutral-800/70 dark:bg-neutral-950/70"
            : "border-transparent px-2 py-3"
        }`}
      >
        <div className="flex items-center justify-between px-2">
          <Link href="/" onClick={() => setOpen(false)}>
            <Logo markSize={22} className="text-[15px]" />
          </Link>

          <nav aria-label="Main" className="hidden items-center gap-7 text-sm sm:flex">
            {links.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  // The active link was signalled by colour and a gradient
                  // underline only — nothing a screen reader could hear.
                  aria-current={active ? "page" : undefined}
                  className={`relative py-1 transition-colors ${
                    active
                      ? "text-neutral-900 dark:text-white"
                      : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                  }`}
                >
                  {link.label}
                  {active && (
                    <span
                      aria-hidden
                      className="absolute -bottom-1 left-0 right-0 h-px"
                      style={{ background: "var(--brand-gradient)" }}
                    />
                  )}
                </Link>
              );
            })}
            <ThemeToggle />
            <ShineButton>
              <Link
                href={cta.href}
                className="inline-block whitespace-nowrap rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
              >
                {cta.label}
              </Link>
            </ShineButton>
          </nav>

          <div className="flex items-center gap-2 sm:hidden">
            <ThemeToggle />
            <button
              ref={toggleRef}
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="rounded-md p-2 text-neutral-700 dark:text-neutral-300"
              // Open/closed was conveyed only by swapping the icon glyph.
              // aria-expanded + aria-controls state it properly, and the
              // label now says what pressing it will do.
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="mobile-nav"
            >
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {open && (
            <motion.nav
              id="mobile-nav"
              aria-label="Main"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden sm:hidden"
            >
              <div className="mt-2 flex flex-col gap-1 border-t border-neutral-200/70 px-2 pt-3 text-sm dark:border-neutral-800/70">
                {links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    aria-current={pathname === link.href ? "page" : undefined}
                    className="rounded-md px-2 py-2.5 text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-900"
                  >
                    {link.label}
                  </Link>
                ))}
                <Link
                  href={cta.href}
                  onClick={() => setOpen(false)}
                  className="mt-2 rounded-lg bg-neutral-900 px-4 py-2.5 text-center text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
                >
                  {cta.label}
                </Link>
              </div>
            </motion.nav>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
