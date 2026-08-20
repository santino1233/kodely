"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Logo } from "./Logo";

/** Abstract, brand-colored wallpaper for the auth screen's side panel — a
 * few large soft blobs drifting slowly, never anything literal (no fake
 * product screenshot), so it reads as pure atmosphere behind the wordmark
 * and a short line of copy. */
export function AuthWallpaper() {
  const reduced = useReducedMotion();

  return (
    <div className="relative hidden h-full w-full overflow-hidden bg-neutral-950 lg:block">
      <motion.div
        aria-hidden
        className="absolute -left-1/4 -top-1/4 h-[70%] w-[70%] rounded-full blur-[110px]"
        style={{ background: "radial-gradient(closest-side, #ff4c8b, transparent)" }}
        animate={reduced ? undefined : { x: [0, 40, 0], y: [0, 30, 0] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="absolute -bottom-1/4 -right-1/4 h-[65%] w-[65%] rounded-full blur-[110px]"
        style={{ background: "radial-gradient(closest-side, #b472ff, transparent)" }}
        animate={reduced ? undefined : { x: [0, -30, 0], y: [0, -40, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      />
      <motion.div
        aria-hidden
        className="absolute bottom-0 left-1/4 h-[50%] w-[50%] rounded-full opacity-70 blur-[110px]"
        style={{ background: "radial-gradient(closest-side, #ff8778, transparent)" }}
        animate={reduced ? undefined : { x: [0, 20, 0], y: [0, -20, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
      />

      <div className="absolute inset-0 bg-black/10" aria-hidden />

      <div className="relative flex h-full flex-col justify-between p-12">
        <Logo markSize={26} className="text-lg" />
        <div className="max-w-sm">
          <p className="text-3xl font-semibold leading-tight tracking-tight text-white">
            Build something that didn&apos;t exist five minutes ago.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-white/70">
            Describe the site you want. Kodely designs it, builds a real React
            app, and puts it online at a real, working URL.
          </p>
        </div>
      </div>
    </div>
  );
}
