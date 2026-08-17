"use client";

import { useRouter } from "next/navigation";

export default function SignOutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/login");
        router.refresh();
      }}
      className="text-sm text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white"
    >
      Sign out
    </button>
  );
}
