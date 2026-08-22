"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

// The theme lives on <html>, set by the inline no-flash script in
// app/layout.tsx BEFORE React ever runs — so it is genuinely external state,
// not React state, and it is unknowable on the server. useSyncExternalStore
// is the right tool for exactly that shape:
//
//  * getServerSnapshot() returns null, which is what both the SSR pass and
//    the hydration render use — so the button renders empty in the server
//    HTML and empty again on first client render. That is the hydration
//    guard the old `useState(null)` + effect was providing, kept intact.
//  * getSnapshot() reads the live class after hydration.
//  * subscribing with a MutationObserver means the icon also follows a class
//    change made by anything else (another ThemeToggle on the page, the
//    no-flash script re-running), instead of only the click this component
//    handled itself.
function subscribeToThemeClass(onStoreChange: () => void) {
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

const readTheme = () => document.documentElement.classList.contains("dark");
const themeUnknownOnServer = () => null;

export function ThemeToggle() {
  const dark = useSyncExternalStore<boolean | null>(
    subscribeToThemeClass,
    readTheme,
    themeUnknownOnServer,
  );

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    document.documentElement.classList.toggle("light", !next);
    try {
      localStorage.setItem("kodely-theme", next ? "dark" : "light");
    } catch {}
  }

  return (
    <button
      type="button"
      onClick={toggle}
      // Before hydration the current theme is unknown, so the label has to
      // stay neutral rather than claim a direction it might have backwards.
      aria-label={
        dark === null ? "Toggle theme" : dark ? "Switch to light theme" : "Switch to dark theme"
      }
      className="grid h-9 w-9 place-items-center rounded-lg border border-neutral-200 text-neutral-600 transition-colors hover:border-neutral-400 hover:text-neutral-900 dark:border-neutral-800 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:text-white"
    >
      {dark === null ? null : dark ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}
