import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getBalance } from "@/lib/credits";
import { db } from "@/lib/db";
import { billingEnabled } from "@/lib/stripe";
import NewProjectButton from "./NewProjectButton";
import SignOutButton from "./SignOutButton";
import TopUpButton from "./TopUpButton";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [balance, projects] = await Promise.all([
    getBalance(user.id),
    db.project.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, slug: true, publishedAt: true, updatedAt: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold tracking-tight">kodely</div>
          <p className="text-sm text-black/60 dark:text-white/60">{user.email}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm">
            <span className="font-medium">{balance}</span>{" "}
            <span className="text-black/60 dark:text-white/60">credits</span>
          </div>
          {billingEnabled() && <TopUpButton />}
          <SignOutButton />
        </div>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-base font-medium">Your sites</h1>
        <NewProjectButton />
      </div>

      {projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-black/15 p-10 text-center text-sm text-black/60 dark:border-white/15 dark:text-white/60">
          Nothing here yet. Create a site and describe what you want built.
        </div>
      ) : (
        <ul className="divide-y divide-black/10 rounded-xl border border-black/10 dark:divide-white/10 dark:border-white/10">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                href={`/projects/${p.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
              >
                <span className="text-sm font-medium">{p.name}</span>
                <span className="text-xs text-black/50 dark:text-white/50">
                  {p.publishedAt ? "Published" : "Draft"} · {p.slug}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
