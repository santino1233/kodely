"use client";

import { Suspense, useState } from "react";
import { usePendingPrompt } from "@/components/marketing/usePendingPrompt";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { SIGNUP_GRANT } from "@/lib/credits";
import { destinationAfterAuth } from "@/lib/pending-prompt";
import { passwordScore } from "@/lib/password-strength";
import { Reveal } from "@/components/marketing/Reveal";
import { MotionLift } from "@/components/marketing/FloatCard";
import { PasswordStrengthMeter } from "@/components/marketing/PasswordStrengthMeter";
import { GoogleButton } from "@/components/marketing/GoogleButton";
import { PasswordInput } from "@/components/marketing/PasswordInput";

// `outline-none` killed the browser's focus ring and left only a one-step
// border shade as the focus signal (#e5e5e5 -> #a3a3a3, 1.4:1 against the
// field beside it) — well under the 3:1 WCAG 2.4.11 wants from a focus
// indicator. The border shift stays; a focus-visible outline in the brand
// accent is added on top of it, mouse clicks unaffected.
// Placeholder colour moved neutral-400 -> neutral-500 (2.5:1 -> 4.7:1) and
// neutral-600 -> neutral-400 in dark (2.5:1 -> 7.9:1); placeholders are the
// only in-field hint here, so they have to be readable.
const inputClass =
  "w-full rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-neutral-500 focus:border-neutral-400 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)] dark:border-neutral-800 dark:bg-neutral-950 dark:placeholder:text-neutral-400 dark:focus:border-neutral-600";

const GOOGLE_ERRORS: Record<string, string> = {
  google_not_configured: "Google sign-in isn't set up yet — use email instead.",
  google_failed: "Google sign-in didn't go through. Try again or use email.",
  // Emitted by the Google callback when the signups kill switch is off.
  // Deliberately not folded into google_failed: Google worked perfectly,
  // and "try again or use email" would send them at a signup route that
  // is also switched off.
  signups_paused: "New sign-ups are paused right now — please try again a little later.",
};

function googleErrorMessage(code: string | null) {
  if (!code) return null;
  return GOOGLE_ERRORS[code] ?? "Something went wrong.";
}

export function SignupForm() {
  return (
    <Suspense fallback={null}>
      <SignupFormFields />
    </Suspense>
  );
}

function SignupFormFields() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const pendingPrompt = usePendingPrompt();

  // ?error=… is readable while rendering, so the banner is derived, not
  // synced from an effect. Lazy initial state covers the first render; the
  // render-time adjustment below covers a later client navigation that
  // changes the param (React's documented "adjust state when a prop changes"
  // pattern — it re-renders before committing, so nothing is painted twice).
  const googleError = searchParams.get("error");
  const [error, setError] = useState<string | null>(() => googleErrorMessage(googleError));
  const [shownGoogleError, setShownGoogleError] = useState(googleError);
  if (googleError !== shownGoogleError) {
    setShownGoogleError(googleError);
    if (googleError) setError(googleErrorMessage(googleError));
  }

  const passwordsMatch = !confirmPassword || password === confirmPassword;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (passwordScore(password) < 3) {
      setError("Choose a stronger password — mix in a number or symbol.");
      return;
    }

    setLoading(true);
    try {
      await api("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email, password, name: name.trim() || undefined }),
      });
      const dest = await destinationAfterAuth();
      router.push(dest);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Reveal>
      <form
        onSubmit={onSubmit}
        className="space-y-5 rounded-2xl border border-neutral-200 bg-white/80 p-7 shadow-[var(--sh-s)] backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-950/80"
      >
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Create your <span className="brand-gradient-text">account</span>
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {SIGNUP_GRANT} free credits, no card required — enough to build and iterate on a real site.
          </p>
        </div>

        {pendingPrompt && (
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3.5 py-3 text-sm dark:border-neutral-800 dark:bg-neutral-900">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Picking up where you left off
            </p>
            <p className="mt-1 text-neutral-700 dark:text-neutral-300">“{pendingPrompt}”</p>
          </div>
        )}

        <GoogleButton label="Sign up with Google" />

        <div
          aria-hidden
          className="flex items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400"
        >
          <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
          or
          <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
        </div>

        {/* Every field was placeholder-only: no <label>, so nothing was
            announced, nothing was clickable to focus the field, and the
            "label" vanished the moment you started typing. Real labels,
            associated by id, visually hidden with sr-only so the design is
            unchanged. autoComplete lets password managers fill correctly. */}
        <div className="space-y-3">
          <div>
            <label htmlFor="signup-name" className="sr-only">
              Name (optional)
            </label>
            <input
              id="signup-name"
              name="name"
              type="text"
              autoComplete="name"
              placeholder="Name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="signup-email" className="sr-only">
              Email
            </label>
            <input
              id="signup-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="signup-password" className="sr-only">
              Password (minimum 8 characters)
            </label>
            <PasswordInput
              id="signup-password"
              name="password"
              autoComplete="new-password"
              required
              minLength={8}
              placeholder="Password (min 8 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              // The strength meter below describes this field, so point at
              // it rather than leaving it as unattached decoration. Only
              // while it is actually on screen — it renders nothing for an
              // empty password, and a dangling reference is worse than none.
              aria-describedby={password ? "password-strength" : undefined}
              className={inputClass}
            />
          </div>
          <PasswordStrengthMeter password={password} />
          <div>
            <label htmlFor="signup-confirm" className="sr-only">
              Confirm password
            </label>
            <PasswordInput
              id="signup-confirm"
              name="confirm-password"
              autoComplete="new-password"
              required
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              // The mismatch was signalled by a red border only — invisible
              // to assistive tech, and to anyone who can't distinguish the
              // border colour. aria-invalid states it, aria-describedby ties
              // the field to the message that explains it.
              aria-invalid={!passwordsMatch}
              aria-describedby={!passwordsMatch ? "confirm-password-error" : undefined}
              className={`${inputClass} ${!passwordsMatch ? "border-red-400 focus:border-red-400 dark:border-red-900" : ""}`}
            />
          </div>
          {!passwordsMatch && (
            <p id="confirm-password-error" className="text-xs text-red-700 dark:text-red-400">
              Passwords don&apos;t match.
            </p>
          )}
        </div>

        {/* role="alert" so a rejected signup is spoken when it appears —
            previously it only rendered silently below the fields. */}
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400"
          >
            {error}
          </p>
        )}

        <MotionLift lift={2} className="block">
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg px-3.5 py-2.5 text-sm font-medium text-white shadow-[0_14px_34px_-16px_var(--glow)] transition-opacity disabled:opacity-50"
            style={{ background: "var(--brand-gradient)" }}
          >
            {loading ? "Creating account…" : pendingPrompt ? "Create account & build it" : "Create account"}
          </button>
        </MotionLift>

        <p className="text-center text-sm text-neutral-500 dark:text-neutral-400">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-neutral-900 underline underline-offset-2 dark:text-white">
            Sign in
          </Link>
        </p>
      </form>
    </Reveal>
  );
}
