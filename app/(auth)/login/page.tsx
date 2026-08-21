"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { PENDING_PROMPT_KEY, destinationAfterAuth } from "@/lib/pending-prompt";
import { Reveal } from "@/components/marketing/Reveal";
import { MotionLift } from "@/components/marketing/FloatCard";
import { GoogleButton } from "@/components/marketing/GoogleButton";
import { PasswordInput } from "@/components/marketing/PasswordInput";

const inputClass =
  "w-full rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-950 dark:placeholder:text-neutral-600 dark:focus:border-neutral-600";

const GOOGLE_ERRORS: Record<string, string> = {
  google_not_configured: "Google sign-in isn't set up yet — use email instead.",
  google_failed: "Google sign-in didn't go through. Try again or use email.",
};

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);

  useEffect(() => {
    try {
      setPendingPrompt(sessionStorage.getItem(PENDING_PROMPT_KEY));
    } catch {}
    const googleError = searchParams.get("error");
    if (googleError) setError(GOOGLE_ERRORS[googleError] ?? "Something went wrong.");
  }, [searchParams]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
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
          <h1 className="text-xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Sign in to keep building.
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

        <GoogleButton label="Sign in with Google" />

        <div className="flex items-center gap-3 text-xs text-neutral-400 dark:text-neutral-600">
          <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
          or
          <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
        </div>

        <div className="space-y-3">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
          <PasswordInput
            required
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
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
            {loading ? "Signing in…" : pendingPrompt ? "Sign in & build it" : "Sign in"}
          </button>
        </MotionLift>

        <p className="text-center text-sm text-neutral-500 dark:text-neutral-400">
          No account yet?{" "}
          <Link href="/signup" className="font-medium text-neutral-900 underline underline-offset-2 dark:text-white">
            Create one
          </Link>
        </p>
      </form>
    </Reveal>
  );
}
