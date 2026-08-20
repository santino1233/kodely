"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { destinationAfterAuth } from "@/lib/pending-prompt";

// The Google OAuth callback is a server-side redirect, which can't read the
// sessionStorage prompt a visitor typed before hitting the auth wall — it
// lands here instead, and this client page picks up where the normal
// email/password flow's onSubmit handler would have.
export default function ContinuePage() {
  const router = useRouter();

  useEffect(() => {
    destinationAfterAuth().then((dest) => {
      router.replace(dest);
      router.refresh();
    });
  }, [router]);

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-200 dark:border-neutral-800"
        style={{ borderTopColor: "var(--accent)" }}
      />
      <p className="text-sm text-neutral-500 dark:text-neutral-400">Signing you in…</p>
    </div>
  );
}
