import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

// The admin section grew to eight pages, none of which linked to each other —
// every one was reachable only by typing its URL. This is the index.
//
// Ordered by how often you'd reach for them in an actual incident, not
// alphabetically: what's happening now, then who it's happening to, then the
// controls, then the record of who touched what.
const SECTIONS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/health", label: "Health" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/builds", label: "Builds" },
  { href: "/admin/users", label: "Customers" },
  { href: "/admin/sites", label: "Sites" },
  // Above Feedback deliberately: this one is a work queue with people waiting
  // on it, and Feedback is a trend you read when you have time.
  { href: "/admin/support", label: "Support" },
  { href: "/admin/feedback", label: "Feedback" },
  { href: "/admin/content", label: "Content" },
  { href: "/admin/assets", label: "Assets" },
  { href: "/admin/flags", label: "Flags" },
  { href: "/admin/audit", label: "Audit" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // The primary authorization gate for the whole section. Every page ALSO
  // calls getAdminUser() itself — Next's own docs are explicit that a layout
  // must not be the sole boundary, since it does not re-render on every
  // navigation within a section and route handlers never sit under it at all.
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") redirect("/dashboard");

  return (
    <>
      <nav
        aria-label="Admin sections"
        className="border-b border-black/10 bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.02]"
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-1 gap-y-1 px-6 py-2">
          {SECTIONS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="rounded-md px-2.5 py-1 text-xs text-black/60 hover:bg-black/5 hover:text-black focus-visible:ring-2 focus-visible:ring-black/40 focus-visible:outline-none dark:text-white/60 dark:hover:bg-white/5 dark:hover:text-white dark:focus-visible:ring-white/40"
            >
              {s.label}
            </Link>
          ))}
          <span className="ml-auto text-xs text-black/40 dark:text-white/40">{user.email}</span>
        </div>
      </nav>
      {children}
    </>
  );
}
