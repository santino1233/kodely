"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, Copy, ExternalLink, MoreHorizontal, Pencil, Rocket, SquarePen, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Field";
import { Menu } from "@/components/ui/Menu";
import type { MenuItem } from "@/components/ui/Menu";
import { ConfirmModal, Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

/* One site, as a card or as a row. Both variants are the same component on
   purpose: the grid/list toggle must not be able to show different facts or
   offer different actions depending on which way it is pointed.

   Every prop is a plain value computed on the server (see
   app/(portal)/dashboard/websites/data.ts). Nothing here re-derives state from
   a Date or a Prisma row, which is what keeps the two pages that render this
   from drifting apart — and what keeps relative timestamps from disagreeing
   with the server HTML at hydration. */

export type WebsiteCover = {
  from: string;
  to: string;
  /** "brand" = the site's real palette. "slug" = derived, no kit exists. */
  source: "brand" | "slug";
};

export type WebsiteCardProject = {
  id: string;
  name: string;
  slug: string;
  /** `https://<slug>.<sites base>` — the address a publish puts it at. */
  liveUrl: string;
  liveLabel: string;
  published: boolean;
  /** A RUNNING build young enough to still be believed. See BUILD_STALE_MS. */
  building: boolean;
  /** There is a compiled draft tree, so Publish would not 400. */
  publishable: boolean;
  monogram: string;
  cover: WebsiteCover;
  updatedAt: number;
  updatedIso: string;
  updatedLabel: string;
  createdAt: number;
  createdIso: string;
  createdLabel: string;
};

/** Matches the cap in app/api/projects/[id]/route.ts. */
const NAME_MAX = 80;

type Dialog = "none" | "rename" | "delete";

/**
 * The generated cover.
 *
 * Deliberately NOT a screenshot and deliberately not shaped like one: no
 * browser chrome, no fake page layout, no blurred rectangle standing in for
 * content. It is a coloured field with the site's initials, which reads as a
 * generated mark the way a contact's initials disc does. Nothing captures a
 * screenshot in this product, so anything that resembled one would be a lie.
 *
 * Gradient ids are derived from the project's cuid rather than useId(): React
 * 19's generated ids contain characters that are awkward inside `url(#…)`, and
 * a cuid is already unique and URL-safe.
 */
function Cover({ project, className }: { project: WebsiteCardProject; className: string }) {
  const gradientId = `wc-g-${project.id}`;
  const dotsId = `wc-d-${project.id}`;
  return (
    <svg
      viewBox="0 0 320 180"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={`${project.name} — generated cover`}
      className={className}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={project.cover.from} />
          <stop offset="100%" stopColor={project.cover.to} />
        </linearGradient>
        <pattern id={dotsId} width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1" fill="rgba(255,255,255,0.22)" />
        </pattern>
      </defs>
      <rect width="320" height="180" fill={`url(#${gradientId})`} />
      <rect width="320" height="180" fill={`url(#${dotsId})`} />
      <text
        x="160"
        y="92"
        textAnchor="middle"
        dominantBaseline="central"
        fill="rgba(255,255,255,0.94)"
        fontSize="58"
        fontWeight="600"
        letterSpacing="-2"
        fontFamily="inherit"
      >
        {project.monogram}
      </text>
    </svg>
  );
}

function StatusBadge({ project }: { project: WebsiteCardProject }) {
  if (project.building) {
    return (
      <Badge tone="info" dot pulse>
        Building
      </Badge>
    );
  }
  return project.published ? (
    <Badge tone="ok" dot>
      Published
    </Badge>
  ) : (
    <Badge tone="neutral" dot>
      Draft
    </Badge>
  );
}

export function WebsiteCard({
  project,
  variant = "grid",
}: {
  project: WebsiteCardProject;
  variant?: "grid" | "list";
}) {
  const router = useRouter();
  const toast = useToast();

  const [dialog, setDialog] = useState<Dialog>("none");
  const [busy, setBusy] = useState(false);
  const [draftName, setDraftName] = useState(project.name);
  const [renameError, setRenameError] = useState<string | null>(null);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast({
        tone: "danger",
        message: err instanceof ApiError ? err.message : `Couldn't ${label}. Try again.`,
      });
    } finally {
      setBusy(false);
    }
  }

  const trimmed = draftName.trim();

  function saveRename() {
    if (trimmed.length === 0) {
      setRenameError("A name is required.");
      return;
    }
    if (trimmed === project.name) {
      setDialog("none");
      return;
    }
    setRenameError(null);
    void run("rename this site", async () => {
      await api(`/api/projects/${project.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: trimmed }),
      });
      setDialog("none");
      toast({ tone: "ok", message: `Renamed to “${trimmed}”.` });
      router.refresh();
    });
  }

  function duplicate() {
    void run("duplicate this site", async () => {
      const { project: copy } = await api<{ project: { id: string; name: string } }>(
        `/api/projects/${project.id}`,
        { method: "POST" },
      );
      toast({
        tone: "ok",
        message: `Copied to “${copy.name}”. Nothing was generated, so this cost no credits.`,
        action: { label: "Open", onClick: () => router.push(`/projects/${copy.id}`) },
      });
      router.refresh();
    });
  }

  function publish() {
    void run("publish this site", async () => {
      const { url } = await api<{ url: string }>(`/api/projects/${project.id}/publish`, {
        method: "POST",
      });
      toast({
        tone: "ok",
        message: project.published ? "Republished — the live site is updated." : "Published. Your site is live.",
        action: { label: "Visit", onClick: () => window.open(url, "_blank", "noopener,noreferrer") },
      });
      router.refresh();
    });
  }

  function confirmDelete() {
    void run("delete this site", async () => {
      await api(`/api/projects/${project.id}`, { method: "DELETE" });
      setDialog("none");
      toast({ tone: "ok", message: `“${project.name}” was deleted.` });
      router.refresh();
    });
  }

  const items: MenuItem[] = [
    {
      kind: "item",
      label: "Open live site",
      icon: <ExternalLink className="size-3.5" />,
      onSelect: () => window.open(project.liveUrl, "_blank", "noopener,noreferrer"),
      unavailableReason: project.published ? undefined : "Not published",
    },
    {
      kind: "item",
      label: "Edit in the builder",
      icon: <SquarePen className="size-3.5" />,
      href: `/projects/${project.id}`,
    },
    { kind: "separator" },
    {
      kind: "item",
      label: "Rename",
      icon: <Pencil className="size-3.5" />,
      onSelect: () => {
        setDraftName(project.name);
        setRenameError(null);
        setDialog("rename");
      },
    },
    {
      kind: "item",
      label: "Duplicate",
      icon: <Copy className="size-3.5" />,
      onSelect: duplicate,
    },
    {
      kind: "item",
      label: project.published ? "Republish" : "Publish",
      icon: <Rocket className="size-3.5" />,
      onSelect: publish,
      unavailableReason: project.publishable ? undefined : "Nothing built yet",
    },
    { kind: "separator" },
    {
      // Kept visible rather than hidden: people look for it. There is no
      // soft-delete column on Project and no route that could set one, so the
      // honest answer is to say so where the customer goes looking.
      kind: "item",
      label: "Archive",
      icon: <Archive className="size-3.5" />,
      unavailableReason: "Doesn’t exist yet",
    },
    {
      kind: "item",
      label: "Delete…",
      icon: <Trash2 className="size-3.5" />,
      danger: true,
      onSelect: () => setDialog("delete"),
    },
  ];

  const menu = (
    <Menu
      align="end"
      className="relative z-10 shrink-0"
      items={items}
      trigger={(props) => (
        <IconButton {...props} type="button" size="sm" label={`Actions for ${project.name}`} disabled={busy}>
          <MoreHorizontal className="size-4" />
        </IconButton>
      )}
    />
  );

  const address = project.published ? (
    <a
      href={project.liveUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="k-focus relative z-10 truncate rounded-xs text-[0.8125rem] text-ink-2 underline-offset-2 hover:text-brand hover:underline"
    >
      {project.liveLabel}
    </a>
  ) : (
    <span className="truncate text-[0.8125rem] text-ink-3" title={`${project.liveLabel} once published`}>
      {project.liveLabel}
    </span>
  );

  const dialogs = (
    <>
      {dialog === "rename" && (
        <Modal
          open
          onClose={() => setDialog("none")}
          title="Rename site"
          description={`The address stays ${project.liveLabel} — renaming never changes a site’s URL.`}
          size="sm"
          footer={
            <>
              <Button variant="ghost" size="sm" onClick={() => setDialog("none")} disabled={busy}>
                Cancel
              </Button>
              <Button variant="secondary" size="sm" onClick={saveRename} loading={busy}>
                Save name
              </Button>
            </>
          }
        >
          <Input
            label="Site name"
            autoFocus
            value={draftName}
            maxLength={NAME_MAX}
            disabled={busy}
            error={renameError ?? undefined}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                saveRename();
              }
            }}
          />
        </Modal>
      )}

      {dialog === "delete" && (
        <ConfirmModal
          open
          busy={busy}
          onClose={() => setDialog("none")}
          onConfirm={confirmDelete}
          title={`Delete ${project.name}?`}
          confirmLabel="Delete site"
          // Only PUBLISHED sites get the type-the-name gate. Deleting one takes
          // a live address offline instantly and releases the slug, so it is
          // irreversible AND public. A draft is neither, and demanding typing
          // for it would only train people to type without reading — which
          // would cost the gate its value exactly where it is load-bearing.
          requireText={project.published ? project.name : undefined}
          requireTextLabel="Type the site's name to confirm"
          body={
            <>
              <p>
                This deletes the site, its files, its chat history and its build history. There is
                no archive and no undo —{" "}
                <strong className="font-medium text-ink">it cannot be recovered.</strong>
              </p>
              {project.published && (
                <p className="mt-2 text-danger">
                  {project.liveLabel} is live. Deleting takes it offline immediately, and the
                  address is released — it cannot be reclaimed.
                </p>
              )}
              <p className="mt-2 text-xs text-ink-3">
                Your credit balance and billing history are unaffected.
              </p>
            </>
          }
        />
      )}
    </>
  );

  // ── List row ─────────────────────────────────────────────────────────────
  if (variant === "list") {
    return (
      <div className="relative flex items-center gap-3 px-3 py-2.5 transition-colors duration-[var(--t-1)] hover:bg-surface-2 sm:gap-4 sm:px-4">
        <Cover project={project} className="h-10 w-16 shrink-0 rounded-sm" />

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href={`/projects/${project.id}`}
              className="k-focus truncate rounded-xs text-sm font-medium text-ink after:absolute after:inset-0 after:content-['']"
            >
              {project.name}
            </Link>
            <StatusBadge project={project} />
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-2">{address}</div>
        </div>

        <div className="k-num hidden w-36 shrink-0 text-right text-xs text-ink-2 md:block">
          <time dateTime={project.updatedIso}>{project.updatedLabel}</time>
          <span className="sr-only"> — last updated</span>
        </div>
        <div className="k-num hidden w-28 shrink-0 text-right text-xs text-ink-3 lg:block">
          <time dateTime={project.createdIso}>{project.createdLabel}</time>
          <span className="sr-only"> — created</span>
        </div>

        {menu}
        {dialogs}
      </div>
    );
  }

  // ── Grid card ────────────────────────────────────────────────────────────
  return (
    <Card interactive padded={false} className="relative flex w-full flex-col overflow-hidden">
      <Cover project={project} className="aspect-video w-full" />

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/projects/${project.id}`}
            className="k-focus min-w-0 rounded-xs text-sm font-medium text-ink after:absolute after:inset-0 after:content-['']"
          >
            <span className="line-clamp-2">{project.name}</span>
          </Link>
          {menu}
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <StatusBadge project={project} />
          {address}
        </div>

        <dl className="k-num mt-auto grid grid-cols-2 gap-x-3 border-t border-hair pt-3 text-xs">
          <div className="min-w-0">
            <dt className="text-ink-3">Updated</dt>
            <dd className="truncate text-ink-2">
              <time dateTime={project.updatedIso}>{project.updatedLabel}</time>
            </dd>
          </div>
          <div className="min-w-0 text-right">
            <dt className="text-ink-3">Created</dt>
            <dd className="truncate text-ink-2">
              <time dateTime={project.createdIso}>{project.createdLabel}</time>
            </dd>
          </div>
        </dl>
      </div>

      {dialogs}
    </Card>
  );
}
