import type { FoundationFile } from "../types";

// The vertical: the files a generation is expected to rewrite. Everything here
// is small on purpose — if a change belongs in the kernel it should go in the
// kernel, where no build pays to have the model rewrite it.
export const APP_FILES: Record<string, FoundationFile> = {
  "index.html": {
    purpose: "Document head: title, description and OG tags. Rewrite these for the real app.",
    editable: true,
    content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Client Tracker</title>
    <meta
      name="description"
      content="A private client tracker: contacts, what was said, and what you owe them next. Stored in your own browser, on this device only."
    />
    <meta property="og:title" content="Client Tracker" />
    <meta
      property="og:description"
      content="A private client tracker: contacts, what was said, and what you owe them next. Stored in your own browser, on this device only."
    />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="robots" content="noindex" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
  },
  "src/main.tsx": {
    purpose: "React entry point. Nothing to change here.",
    editable: false,
    content: `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`,
  },
  "src/index.css": {
    purpose: "Tailwind import, the dark-mode variant, and the font stack.",
    editable: true,
    content: `@import "tailwindcss";

/* Dark mode is a class on <html>, toggled by useTheme in src/kernel/hooks.tsx,
   so the user's choice survives a reload instead of following the OS only. */
@custom-variant dark (&:where(.dark, .dark *));

@theme {
  --font-sans: ui-sans-serif, -apple-system, "Segoe UI", Inter, sans-serif;
}

:root {
  color-scheme: light;
}

html.dark {
  color-scheme: dark;
}

/* Painted on the root element so the page never flashes white behind a
   dark layout while the bundle is still parsing. */
html {
  background-color: #fafafa;
}

html.dark {
  background-color: #0a0a0a;
}
`,
  },
  "src/App.tsx": {
    purpose: "Wiring: store, providers, shell, routes, dashboard.",
    editable: true,
    content: `// Wiring only. The schema drives every screen except the dashboard.

import { useMemo } from "react";
import { Store } from "./kernel/store";
import { StoreProvider } from "./kernel/hooks";
import { AppShell } from "./kernel/AppShell";
import { AppRoutes } from "./kernel/AppRoutes";
import { ToastProvider } from "./kernel/ui";
import { schema } from "./app/schema";
import { APP_ID, brand } from "./app/branding";
import { Dashboard } from "./app/Dashboard";

export default function App() {
  // One store for the life of the page. It reads localStorage once on
  // construction, so building it inside render would re-read on every keystroke.
  const store = useMemo(() => new Store(APP_ID, schema), []);

  return (
    <StoreProvider store={store}>
      <ToastProvider>
        <AppShell schema={schema} brand={brand}>
          <AppRoutes schema={schema} brand={brand} dashboard={<Dashboard />} />
        </AppShell>
      </ToastProvider>
    </StoreProvider>
  );
}
`,
  },
  "src/app/schema.ts": {
    purpose: "THE APP'S DATA MODEL. Collections and fields — edit this first.",
    editable: true,
    content: `// ─────────────────────────────────────────────────────────────────────────────
// THE APP. This file, branding.ts and Dashboard.tsx are the three files worth
// editing — everything under src/kernel/ reads them and generates the rest.
//
// Adding a field: add it to the fields array. The list, the form, the detail
// page, validation, search and the CSV export all pick it up with no other
// change. Adding a whole collection: add it to \`collections\` and it appears
// in the nav with full create / read / update / delete.
//
// Renaming a field's \`name\` orphans data already stored under the old name,
// so change \`label\` freely and \`name\` almost never.
// ─────────────────────────────────────────────────────────────────────────────

import type { AppSchema } from "../kernel/types";

export const schema: AppSchema = {
  version: 1,
  // ISO 4217. Change this to the currency the business actually invoices in.
  currency: "USD",

  collections: [
    {
      key: "clients",
      singular: "Client",
      plural: "Clients",
      titleField: "name",
      sort: { field: "name", dir: "asc" },
      emptyHint:
        "Add the people and businesses you work with. Everything you log later — calls, notes, jobs, follow-ups — hangs off a client.",
      related: [
        { collection: "interactions", via: "clientId" },
        { collection: "tasks", via: "clientId" },
      ],
      fields: [
        { name: "name", label: "Name", kind: "text", required: true, inList: true },
        { name: "company", label: "Company", kind: "text", inList: true },
        {
          name: "status",
          label: "Status",
          kind: "select",
          required: true,
          options: ["Lead", "Active", "On hold", "Past"],
          inList: true,
        },
        { name: "value", label: "Value", kind: "currency", inList: true, help: "What this client is worth to you, however you count it." },
        { name: "email", label: "Email", kind: "email" },
        { name: "phone", label: "Phone", kind: "tel" },
        { name: "website", label: "Website", kind: "url" },
        {
          name: "source",
          label: "Came from",
          kind: "select",
          options: ["Referral", "Repeat customer", "Website", "Social", "Walk-in", "Other"],
        },
        { name: "nextStep", label: "Next step", kind: "text", placeholder: "Send the revised quote" },
        { name: "notes", label: "Notes", kind: "textarea" },
      ],
    },

    {
      key: "interactions",
      singular: "Interaction",
      plural: "Interactions",
      titleField: "summary",
      sort: { field: "date", dir: "desc" },
      emptyHint: "Log a call, an email or a site visit so you can remember what was agreed.",
      fields: [
        {
          name: "summary",
          label: "What happened",
          kind: "text",
          required: true,
          inList: true,
          placeholder: "Called about the kitchen quote",
        },
        { name: "clientId", label: "Client", kind: "ref", ref: "clients", required: true, inList: true },
        { name: "date", label: "Date", kind: "date", required: true, inList: true },
        {
          name: "kind",
          label: "Type",
          kind: "select",
          options: ["Call", "Email", "Message", "Meeting", "Quote sent", "Note"],
          inList: true,
        },
        { name: "notes", label: "Details", kind: "textarea" },
      ],
    },

    {
      key: "tasks",
      singular: "Task",
      plural: "Tasks",
      titleField: "title",
      sort: { field: "dueDate", dir: "asc" },
      emptyHint: "Anything you have promised someone you would do. Give it a date so it shows up.",
      fields: [
        { name: "title", label: "Task", kind: "text", required: true, inList: true },
        { name: "clientId", label: "Client", kind: "ref", ref: "clients", inList: true },
        { name: "dueDate", label: "Due", kind: "date", inList: true },
        { name: "done", label: "Done", kind: "checkbox", inList: true },
        { name: "notes", label: "Notes", kind: "textarea" },
      ],
    },
  ],
};

/** Statuses that count as live work, used by the dashboard. */
export const ACTIVE_STATUSES = ["Lead", "Active", "On hold"];
`,
  },
  "src/app/branding.ts": {
    purpose: "App name, tagline and the localStorage namespace.",
    editable: true,
    content: `import type { Brand } from "../kernel/brand";

// Name it after the business that will actually use it. Do NOT invent details
// about a real business here — a name and a description of the work is enough,
// and anything factual (address, hours, prices) does not belong in an app the
// owner has not filled in yet.
export const brand: Brand = {
  appName: "Client Tracker",
  tagline: "Who you are working with, what was said, and what you owe them next.",
  ownerLabel: "you",
};

/**
 * The localStorage namespace. Change it once, at the start, and never again —
 * changing it later makes every existing record invisible (it is still on the
 * device under the old key, but nothing reads it).
 */
export const APP_ID = "client-tracker";
`,
  },
  "src/app/Dashboard.tsx": {
    purpose: "The one screen the kernel cannot generate: what this app thinks matters.",
    editable: true,
    content: `// The one screen the kernel cannot generate: what THIS app thinks matters.
// Everything it uses — the hooks, the tiles, the formatting, the routing — is
// kernel furniture, so this stays short.

import { useMemo } from "react";
import { useCollection } from "../kernel/hooks";
import { detailPath, listPath, navigate, newPath } from "../kernel/router";
import { formatCurrency, formatRelativeDay, isPast } from "../kernel/format";
import { recordTitle } from "../kernel/records";
import { collectionByKey } from "../kernel/types";
import { Badge, Button, Card, EmptyState, PageHeader, StatTile, focusRing } from "../kernel/ui";
import { cx } from "../kernel/cx";
import { ACTIVE_STATUSES, schema } from "./schema";
import { brand } from "./branding";

const clients = collectionByKey(schema, "clients");
const interactions = collectionByKey(schema, "interactions");
const tasks = collectionByKey(schema, "tasks");

export function Dashboard() {
  const clientRows = useCollection("clients");
  const interactionRows = useCollection("interactions");
  const taskRows = useCollection("tasks");

  const stats = useMemo(() => {
    const live = clientRows.filter((row) => ACTIVE_STATUSES.includes(String(row.status)));
    const open = taskRows.filter((row) => !row.done);
    return {
      live: live.length,
      leads: clientRows.filter((row) => row.status === "Lead").length,
      open: open.length,
      overdue: open.filter((row) => isPast(row.dueDate)).length,
      value: live.reduce((sum, row) => sum + (Number(row.value) || 0), 0),
    };
  }, [clientRows, taskRows]);

  const dueSoon = useMemo(
    () =>
      taskRows
        .filter((row) => !row.done && typeof row.dueDate === "string" && row.dueDate)
        .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))
        .slice(0, 5),
    [taskRows],
  );

  const recent = useMemo(
    () =>
      [...interactionRows]
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .slice(0, 5),
    [interactionRows],
  );

  if (!clients || !interactions || !tasks) return null;

  const nothingYet = clientRows.length === 0;

  return (
    <div>
      <PageHeader
        title={brand.appName}
        subtitle={brand.tagline}
        actions={
          <>
            <Button onClick={() => navigate(newPath("clients"))}>New client</Button>
            <Button variant="secondary" onClick={() => navigate(newPath("interactions"))}>
              Log an interaction
            </Button>
          </>
        }
      />

      {nothingYet ? (
        <EmptyState
          title="Nothing here yet"
          body="Add your first client and this page fills in: who is live, what is owed, and what was said last. Everything stays in this browser."
          action={<Button onClick={() => navigate(newPath("clients"))}>Add a client</Button>}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile
              label="Live clients"
              value={stats.live}
              hint={stats.leads + " of them leads"}
              onClick={() => navigate(listPath("clients"))}
            />
            <StatTile
              label="Open tasks"
              value={stats.open}
              hint={stats.overdue > 0 ? stats.overdue + " overdue" : "nothing overdue"}
              onClick={() => navigate(listPath("tasks"))}
            />
            <StatTile
              label="Logged"
              value={interactionRows.length}
              hint="calls, emails, meetings"
              onClick={() => navigate(listPath("interactions"))}
            />
            <StatTile
              label="Live value"
              value={formatCurrency(stats.value, schema.currency) || "—"}
              hint="your own numbers, added up"
            />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
                  What is due
                </h2>
                <Button size="sm" variant="ghost" onClick={() => navigate(listPath("tasks"))}>
                  All tasks
                </Button>
              </div>
              {dueSoon.length === 0 ? (
                <p className="py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
                  No dated tasks outstanding.
                </p>
              ) : (
                <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {dueSoon.map((row) => {
                    const late = isPast(row.dueDate);
                    return (
                      <li key={row.id}>
                        <a
                          href={"#" + detailPath("tasks", row.id)}
                          onClick={(event) => {
                            event.preventDefault();
                            navigate(detailPath("tasks", row.id));
                          }}
                          className={cx(
                            "-mx-2 flex items-center justify-between gap-3 rounded px-2 py-2.5 hover:bg-neutral-50 dark:hover:bg-neutral-800/50",
                            focusRing,
                          )}
                        >
                          <span className="min-w-0 truncate text-sm text-neutral-900 dark:text-neutral-100">
                            {recordTitle(tasks, row)}
                          </span>
                          <Badge tone={late ? "red" : "neutral"}>
                            {formatRelativeDay(row.dueDate)}
                          </Badge>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
                  Last spoken
                </h2>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => navigate(listPath("interactions"))}
                >
                  All interactions
                </Button>
              </div>
              {recent.length === 0 ? (
                <p className="py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
                  Nothing logged yet.
                </p>
              ) : (
                <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {recent.map((row) => {
                    const client = clientRows.find((c) => c.id === row.clientId);
                    return (
                      <li key={row.id}>
                        <a
                          href={"#" + detailPath("interactions", row.id)}
                          onClick={(event) => {
                            event.preventDefault();
                            navigate(detailPath("interactions", row.id));
                          }}
                          className={cx(
                            "-mx-2 block rounded px-2 py-2.5 hover:bg-neutral-50 dark:hover:bg-neutral-800/50",
                            focusRing,
                          )}
                        >
                          <p className="truncate text-sm text-neutral-900 dark:text-neutral-100">
                            {recordTitle(interactions, row)}
                          </p>
                          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                            {client ? recordTitle(clients, client) + " · " : ""}
                            {formatRelativeDay(row.date)}
                          </p>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
`,
  },
};
