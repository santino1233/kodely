"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { SIGNUP_GRANT } from "@/lib/credits";
import { Reveal } from "@/components/marketing/Reveal";
import { MotionLift } from "@/components/marketing/FloatCard";

const inputClass =
  "w-full rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-950 dark:placeholder:text-neutral-600 dark:focus:border-neutral-600";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api("/api/auth/signup", { method: "POST", body: JSON.stringify({ email, password }) });
      router.push("/dashboard");
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

        <div className="space-y-3">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
          <input
            type="password"
            required
            minLength={8}
            placeholder="Password (min 8 characters)"
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
            {loading ? "Creating account…" : "Create account"}
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
