"use client";

import { useState } from "react";
import { MotionLift } from "@/components/marketing/FloatCard";

const CONTACT_EMAIL = "hello@kodely.me";

const inputClass =
  "w-full rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-950 dark:placeholder:text-neutral-600 dark:focus:border-neutral-600";

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const subject = `Message from ${name || "the Kodely site"}`;
    const body = `${message}\n\n—\n${name}${email ? ` <${email}>` : ""}`;
    const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
    setSent(true);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-8 space-y-4 rounded-2xl border border-neutral-200 bg-white/80 p-6 shadow-[var(--sh-s)] backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-950/80"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          type="text"
          required
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
        <input
          type="email"
          required
          placeholder="Your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </div>
      <textarea
        required
        rows={5}
        placeholder="What's up?"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        className={`${inputClass} resize-y`}
      />

      {sent && (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Your email app should have opened with this pre-filled — send it from there to reach us.
        </p>
      )}

      <MotionLift lift={2} className="block">
        <button
          type="submit"
          className="w-full rounded-lg px-3.5 py-2.5 text-sm font-medium text-white shadow-[0_14px_34px_-16px_var(--glow)] transition-opacity"
          style={{ background: "var(--brand-gradient)" }}
        >
          Send message
        </button>
      </MotionLift>

      <p className="text-center text-xs text-neutral-400 dark:text-neutral-600">
        Opens your email app, addressed to {CONTACT_EMAIL}. Prefer to write it yourself?{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-2">
          Email us directly
        </a>
        .
      </p>
    </form>
  );
}
