"use client";

import { useState } from "react";
import { MotionLift } from "@/components/marketing/FloatCard";

const CONTACT_EMAIL = "hello@kodely.me";

const inputClass =
  "w-full rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-950 dark:placeholder:text-neutral-600 dark:focus:border-neutral-600";

type Status = "idle" | "sending" | "sent" | "error";

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [company, setCompany] = useState(""); // honeypot — see the input below
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "sending") return;
    setStatus("sending");
    setError(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message, company }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        setStatus("error");
        return;
      }
      setStatus("sent");
      setName("");
      setEmail("");
      setMessage("");
    } catch {
      setError(`Couldn't reach the server. Email us at ${CONTACT_EMAIL}.`);
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div
        className="mt-8 rounded-2xl border border-neutral-200 bg-white/80 p-8 text-center shadow-[var(--sh-s)] backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-950/80"
        role="status"
      >
        <p className="text-lg font-semibold tracking-tight">Message sent</p>
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
          Thanks — we&apos;ll reply to the address you gave us.
        </p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="mt-5 text-sm font-medium text-neutral-900 underline underline-offset-2 dark:text-white"
        >
          Send another
        </button>
      </div>
    );
  }

  const sending = status === "sending";

  return (
    <form
      onSubmit={onSubmit}
      className="mt-8 space-y-4 rounded-2xl border border-neutral-200 bg-white/80 p-6 shadow-[var(--sh-s)] backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-950/80"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          type="text"
          required
          disabled={sending}
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
        <input
          type="email"
          required
          disabled={sending}
          placeholder="Your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </div>
      <textarea
        required
        rows={5}
        maxLength={5000}
        disabled={sending}
        placeholder="What's up?"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        className={`${inputClass} resize-y`}
      />

      {/* Honeypot. Hidden from humans and skipped by keyboard/screen readers,
          but bots fill every field they find — a non-empty value tells the
          API this is automation. Not `display:none`, which some bots detect. */}
      <div aria-hidden className="absolute left-[-9999px] top-[-9999px]">
        <label>
          Company
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
        </label>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400"
        >
          {error}
        </p>
      )}

      <MotionLift lift={2} className="block">
        <button
          type="submit"
          disabled={sending}
          className="w-full rounded-lg px-3.5 py-2.5 text-sm font-medium text-white shadow-[0_14px_34px_-16px_var(--glow)] transition-opacity disabled:opacity-60"
          style={{ background: "var(--brand-gradient)" }}
        >
          {sending ? "Sending…" : "Send message"}
        </button>
      </MotionLift>

      <p className="text-center text-xs text-neutral-400 dark:text-neutral-600">
        Prefer email?{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-2">
          {CONTACT_EMAIL}
        </a>
      </p>
    </form>
  );
}
