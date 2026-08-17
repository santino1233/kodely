"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function NewProjectButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function create() {
    setLoading(true);
    try {
      const name = window.prompt("What should we call this site?", "My site");
      if (name === null) return;
      const { project } = await api<{ project: { id: string } }>("/api/projects", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      router.push(`/projects/${project.id}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={create}
      disabled={loading}
      className="rounded-lg bg-black px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
    >
      {loading ? "Creating…" : "New site"}
    </button>
  );
}
