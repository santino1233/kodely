import type { FoundationFile } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// THE APP KERNEL — pre-built, and the whole point of a Pro foundation.
//
// None of this is written by the model. It is the CRUD engine, the persistence
// layer, the router, the validation and the entire UI kit, all driven by the
// schema in src/app/schema.ts. A new app is a new schema plus a dashboard;
// everything below stays byte-identical between foundations.
//
// Every file carries a one-line `purpose` and its exported symbols, because
// what the model should receive is that MANIFEST, not this source. See
// describeManifest() in ../index.ts and docs/pro-foundations.md for what the
// difference costs.
// ─────────────────────────────────────────────────────────────────────────────
export const KERNEL_FILES: Record<string, FoundationFile> = {
  "src/kernel/types.ts": {
    purpose: "The schema language: FieldKind, Field, Collection, AppSchema, Row, Snapshot.",
    exports: "collectionByKey, fieldByName",
    editable: false,
    content: `// The schema language. Everything the kernel renders — lists, forms, detail
// pages, validation, CSV columns — is derived from these declarations, so a
// new app is a new schema rather than new screens.

export type FieldKind =
  | "text"
  | "textarea"
  | "email"
  | "tel"
  | "url"
  | "select"
  | "date"
  | "number"
  | "currency"
  | "checkbox"
  | "ref";

export type Field = {
  /** Storage key. Stable: renaming it orphans existing data. */
  name: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  /** For kind "select". The first option is the default for new records. */
  options?: string[];
  /** For kind "ref": the key of the collection this points at. */
  ref?: string;
  placeholder?: string;
  /** Shown under the input. Use it for anything a user could get wrong. */
  help?: string;
  /** Show as a column in the list view. Keep to three or four. */
  inList?: boolean;
};

export type RelatedSpec = {
  /** Key of the collection to show. */
  collection: string;
  /** The ref field on that collection pointing back at this one. */
  via: string;
};

export type Collection = {
  /** Storage key and URL segment: lowercase, no spaces. */
  key: string;
  singular: string;
  plural: string;
  /** Field whose value titles a record everywhere it is shown. */
  titleField: string;
  fields: Field[];
  /** Child collections listed on a record's detail page. */
  related?: RelatedSpec[];
  sort?: { field: string; dir: "asc" | "desc" };
  /** One sentence shown when the collection is empty. */
  emptyHint?: string;
  /** Keep out of the main nav (still reachable from a detail page). */
  nav?: boolean;
};

export type AppSchema = {
  /**
   * Bump this whenever a field is removed or changes kind. The store keeps the
   * stored payload but records the version, so a mismatch is visible instead
   * of silently rendering the wrong thing.
   */
  version: number;
  /** ISO 4217 code used by every "currency" field. */
  currency: string;
  collections: Collection[];
};

/** A stored record. Field values are whatever the schema declares. */
export type Row = {
  id: string;
  createdAt: string;
  updatedAt: string;
} & { [key: string]: unknown };

export type Snapshot = {
  schemaVersion: number;
  savedAt: string;
  collections: { [key: string]: Row[] };
};

export function collectionByKey(schema: AppSchema, key: string): Collection | undefined {
  return schema.collections.find((c) => c.key === key);
}

export function fieldByName(collection: Collection, name: string): Field | undefined {
  return collection.fields.find((f) => f.name === name);
}
`,
  },
  "src/kernel/brand.ts": {
    purpose: "The Brand type: app name, tagline, owner label.",
    exports: "Brand",
    editable: false,
    content: `/** Everything the kernel needs to know about whose app this is. */
export type Brand = {
  /** Shown in the header and used in export filenames. */
  appName: string;
  /** One line under the app name on the dashboard. */
  tagline: string;
  /**
   * Who the single user is, in their own words ("Yusuf", "the studio").
   * Used in the storage notice so it reads like a sentence, not a warning
   * label: "Only you can see this" is truer and clearer than "single-user".
   */
  ownerLabel: string;
};
`,
  },
  "src/kernel/cx.ts": {
    purpose: "cx() — join class names, dropping falsy ones.",
    exports: "cx",
    editable: false,
    content: `/** Join class names, dropping anything falsy. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
`,
  },
  "src/kernel/format.ts": {
    purpose: "Intl-based dates, currency, relative days, bytes, and per-field display text.",
    exports: "todayIso, nowIso, parseDateOnly, formatDate, formatDateTime, formatRelativeDay, isPast, formatCurrency, formatBytes, formatValue",
    editable: false,
    content: `// Display formatting. Everything goes through Intl, which is in every browser
// and costs nothing to ship — a date library would be a dependency this app
// is not allowed to add.

import type { Field } from "./types";

/** Today as YYYY-MM-DD in the viewer's own timezone, not UTC. */
export function todayIso(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * A YYYY-MM-DD value is a calendar date, not an instant. Parsing it with
 * new Date("2026-03-01") gives UTC midnight, which is the previous day for
 * anyone west of Greenwich — the classic off-by-one that makes a booking app
 * show the wrong day. Build it as a local date instead.
 */
export function parseDateOnly(value: string): Date | null {
  const match = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(value.trim());
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  const date = parseDateOnly(value) ?? new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

const DAY_MS = 86400000;

/** "in 3 days", "yesterday", "today" — from a YYYY-MM-DD value. */
export function formatRelativeDay(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  const date = parseDateOnly(value);
  if (!date) return "";
  const today = parseDateOnly(todayIso());
  if (!today) return "";
  const days = Math.round((date.getTime() - today.getTime()) / DAY_MS);
  if (days === 0) return "today";
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (Math.abs(days) < 30) return rtf.format(days, "day");
  return rtf.format(Math.round(days / 30), "month");
}

/** True when a YYYY-MM-DD value is strictly before today. */
export function isPast(value: unknown): boolean {
  if (typeof value !== "string" || !value) return false;
  const date = parseDateOnly(value);
  const today = parseDateOnly(todayIso());
  if (!date || !today) return false;
  return date.getTime() < today.getTime();
}

export function formatCurrency(value: unknown, currency: string): string {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) return "";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    // An unknown ISO code should degrade to a plain number, never throw.
    return new Intl.NumberFormat(undefined).format(amount);
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

/** The plain-text rendering of one field value, used by lists and CSV alike. */
export function formatValue(field: Field, value: unknown, currency: string): string {
  if (value === null || value === undefined || value === "") return "";
  switch (field.kind) {
    case "date":
      return formatDate(value);
    case "currency":
      return formatCurrency(value, currency);
    case "number":
      return Number.isFinite(Number(value)) ? new Intl.NumberFormat().format(Number(value)) : "";
    case "checkbox":
      return value ? "Yes" : "No";
    default:
      return String(value);
  }
}
`,
  },
  "src/kernel/store.ts": {
    purpose: "The localStorage persistence layer: load, coerce, CRUD, export, wipe, cross-tab sync.",
    exports: "Store, coerceSnapshot, StorageStatus",
    editable: false,
    content: `// The persistence layer. ONE device, ONE browser, no server.
//
// Everything lives under a single localStorage key holding a JSON snapshot.
// That is a deliberate choice over IndexedDB: a whole-snapshot write is
// atomic, trivially exportable, and cannot half-apply, and the data volume a
// single person enters by hand does not come close to the ~5MB budget. The
// cost is that a very large dataset would be slow to write, which is why
// putBytes() below reports usage and the settings screen shows it.
//
// What this CANNOT do, and no amount of code here will change: reach a second
// device, survive "clear site data", or be seen by a second person. Every
// screen that shows data says so.

import type { AppSchema, Row, Snapshot } from "./types";
import { nowIso } from "./format";

export type StorageStatus = "ready" | "unavailable" | "full";

const EMPTY: Row[] = [];

function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/**
 * localStorage throws on access in some privacy modes rather than merely
 * being empty, so every touch is guarded. A probe write is the only reliable
 * detection — the object exists in Safari private mode and fails on setItem.
 */
function probe(): Storage | null {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    const probeKey = "__kodely_probe__";
    s.setItem(probeKey, "1");
    s.removeItem(probeKey);
    return s;
  } catch {
    return null;
  }
}

function emptySnapshot(schema: AppSchema): Snapshot {
  const collections: { [key: string]: Row[] } = {};
  for (const c of schema.collections) collections[c.key] = [];
  return { schemaVersion: schema.version, savedAt: nowIso(), collections };
}

function isRow(value: unknown): value is Row {
  return typeof value === "object" && value !== null && typeof (value as Row).id === "string";
}

/**
 * Accepts anything and returns a snapshot that matches the current schema:
 * unknown collections are dropped, missing ones added, non-records discarded.
 * Import runs through here too, so a hand-edited backup file cannot put the
 * app into a state its own screens cannot render.
 */
export function coerceSnapshot(schema: AppSchema, raw: unknown): Snapshot {
  const base = emptySnapshot(schema);
  if (typeof raw !== "object" || raw === null) return base;
  const input = raw as Partial<Snapshot>;
  const source = typeof input.collections === "object" && input.collections ? input.collections : {};
  for (const c of schema.collections) {
    const rows = (source as { [key: string]: unknown })[c.key];
    if (!Array.isArray(rows)) continue;
    base.collections[c.key] = rows.filter(isRow).map((row) => ({
      ...row,
      createdAt: typeof row.createdAt === "string" ? row.createdAt : nowIso(),
      updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : nowIso(),
    }));
  }
  if (typeof input.savedAt === "string") base.savedAt = input.savedAt;
  base.schemaVersion = typeof input.schemaVersion === "number" ? input.schemaVersion : schema.version;
  return base;
}

export class Store {
  readonly schema: AppSchema;
  readonly storageKey: string;

  private storage: Storage | null;
  private snapshot: Snapshot;
  private listeners = new Set<() => void>();

  status: StorageStatus;
  /** Set when a write fails, so the UI can stop claiming the data is saved. */
  lastError: string | null = null;

  constructor(appId: string, schema: AppSchema) {
    this.schema = schema;
    this.storageKey = "kodely.app." + appId;
    this.storage = probe();
    this.status = this.storage ? "ready" : "unavailable";
    this.snapshot = this.read();

    // A second tab of the same app is the one form of "multi-user" that is
    // actually reachable here, and without this the two tabs silently
    // overwrite each other.
    if (typeof window !== "undefined") {
      window.addEventListener("storage", (event) => {
        if (event.key !== null && event.key !== this.storageKey) return;
        this.snapshot = this.read();
        this.emit();
      });
    }
  }

  private read(): Snapshot {
    if (!this.storage) return emptySnapshot(this.schema);
    try {
      const raw = this.storage.getItem(this.storageKey);
      if (!raw) return emptySnapshot(this.schema);
      return coerceSnapshot(this.schema, JSON.parse(raw));
    } catch {
      // Corrupt JSON must not brick the app. The bad value is left in place
      // rather than overwritten, so it can still be recovered by hand.
      this.lastError = "Saved data could not be read and has been left untouched.";
      return emptySnapshot(this.schema);
    }
  }

  private write(next: Snapshot) {
    this.snapshot = next;
    if (this.storage) {
      try {
        this.storage.setItem(this.storageKey, JSON.stringify(next));
        this.status = "ready";
        this.lastError = null;
      } catch {
        this.status = "full";
        this.lastError = "This browser refused to save — its storage is full.";
      }
    }
    this.emit();
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Stable identity between writes — required by useSyncExternalStore. */
  getSnapshot = (): Snapshot => this.snapshot;

  list(collection: string): Row[] {
    return this.snapshot.collections[collection] ?? EMPTY;
  }

  get(collection: string, id: string): Row | undefined {
    return this.list(collection).find((row) => row.id === id);
  }

  create(collection: string, values: { [key: string]: unknown }): Row {
    const at = nowIso();
    const row: Row = { ...values, id: newId(), createdAt: at, updatedAt: at };
    this.write({
      ...this.snapshot,
      savedAt: at,
      collections: { ...this.snapshot.collections, [collection]: [row, ...this.list(collection)] },
    });
    return row;
  }

  update(collection: string, id: string, values: { [key: string]: unknown }): void {
    const at = nowIso();
    const rows = this.list(collection).map((row) =>
      row.id === id ? { ...row, ...values, id: row.id, createdAt: row.createdAt, updatedAt: at } : row,
    );
    this.write({
      ...this.snapshot,
      savedAt: at,
      collections: { ...this.snapshot.collections, [collection]: rows },
    });
  }

  /**
   * Deletes a record and clears any reference to it. Deliberately NOT a
   * cascade: losing five logged calls because a contact was tidied up is the
   * kind of silent data loss there is no undo for here.
   */
  remove(collection: string, id: string): void {
    const at = nowIso();
    const collections: { [key: string]: Row[] } = {
      ...this.snapshot.collections,
      [collection]: this.list(collection).filter((row) => row.id !== id),
    };
    for (const other of this.schema.collections) {
      const refFields = other.fields.filter((f) => f.kind === "ref" && f.ref === collection);
      if (refFields.length === 0) continue;
      collections[other.key] = (collections[other.key] ?? this.list(other.key)).map((row) => {
        let changed = false;
        const next = { ...row };
        for (const field of refFields) {
          if (next[field.name] === id) {
            next[field.name] = "";
            changed = true;
          }
        }
        return changed ? { ...next, updatedAt: at } : row;
      });
    }
    this.write({ ...this.snapshot, savedAt: at, collections });
  }

  replaceAll(snapshot: Snapshot): void {
    this.write({ ...snapshot, savedAt: nowIso() });
  }

  wipe(): void {
    this.write(emptySnapshot(this.schema));
  }

  exportJson(): string {
    return JSON.stringify(this.snapshot, null, 2);
  }

  /** Bytes this app currently occupies. Approximate: UTF-16 is not counted. */
  usedBytes(): number {
    try {
      return new TextEncoder().encode(JSON.stringify(this.snapshot)).length;
    } catch {
      return 0;
    }
  }

  countAll(): number {
    let total = 0;
    for (const c of this.schema.collections) total += this.list(c.key).length;
    return total;
  }
}
`,
  },
  "src/kernel/hooks.tsx": {
    purpose: "React bindings for the store (useSyncExternalStore) plus the theme hook.",
    exports: "StoreProvider, useStore, useSnapshot, useCollection, useRow, useTheme",
    editable: false,
    content: `import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { Row } from "./types";
import { Store } from "./store";

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ store, children }: { store: Store; children: ReactNode }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used inside <StoreProvider>.");
  return store;
}

/** Re-renders on every write, including one made by another tab. */
export function useSnapshot() {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

export function useCollection(key: string): Row[] {
  const snapshot = useSnapshot();
  return useMemo(() => snapshot.collections[key] ?? [], [snapshot, key]);
}

export function useRow(key: string, id: string | undefined): Row | undefined {
  const rows = useCollection(key);
  return useMemo(() => (id ? rows.find((row) => row.id === id) : undefined), [rows, id]);
}

// ── theme ────────────────────────────────────────────────────────────────────

export type Theme = "light" | "dark";
const THEME_KEY = "kodely.app.theme";

function preferredTheme(): Theme {
  try {
    const stored = globalThis.localStorage?.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Ignore: a browser that will not let us read a preference still gets one.
  }
  if (typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(preferredTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    try {
      globalThis.localStorage?.setItem(THEME_KEY, theme);
    } catch {
      // A theme that does not persist is a cosmetic problem, not an error.
    }
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  return [theme, toggle];
}
`,
  },
  "src/kernel/router.ts": {
    purpose: "Hash router: route parsing, navigation, path builders.",
    exports: "Route, navigate, useRoute, useRoutePath, listPath, detailPath, editPath, newPath, parseRoute",
    editable: false,
    content: `// A hash router in 90 lines, because a router is a dependency this app cannot
// add — and because the published site is served as static files from a path
// that differs between the branded subdomain and the staging URL, so a
// history-API router would need rewrites nobody can configure here.
//
// The current route is also kept in a module variable rather than read from
// location on every render: the editor preview runs the app inside an
// about:srcdoc iframe where assigning location.hash can throw, and a router
// that dies in the preview is a router the user never sees working.

import { useSyncExternalStore } from "react";

export type Route =
  | { name: "home" }
  | { name: "list"; collection: string }
  | { name: "new"; collection: string; prefill: { [key: string]: string } }
  | { name: "detail"; collection: string; id: string }
  | { name: "edit"; collection: string; id: string }
  | { name: "settings" }
  | { name: "unknown"; path: string };

const listeners = new Set<() => void>();

function readHash(): string {
  try {
    const raw = globalThis.location?.hash ?? "";
    const path = raw.startsWith("#") ? raw.slice(1) : raw;
    return path || "/";
  } catch {
    return "/";
  }
}

let current = readHash();

function emit() {
  for (const listener of listeners) listener();
}

if (typeof window !== "undefined") {
  window.addEventListener("hashchange", () => {
    const next = readHash();
    if (next === current) return;
    current = next;
    emit();
  });
}

export function navigate(to: string) {
  if (to === current) return;
  current = to;
  try {
    if (globalThis.location) globalThis.location.hash = to;
  } catch {
    // srcdoc preview: the in-memory route below is still correct.
  }
  emit();
  try {
    globalThis.scrollTo?.({ top: 0 });
  } catch {
    // Non-fatal.
  }
}

export const routeStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot(): string {
    return current;
  },
};

export function listPath(collection: string): string {
  return "/c/" + collection;
}

export function detailPath(collection: string, id: string): string {
  return "/c/" + collection + "/" + id;
}

export function editPath(collection: string, id: string): string {
  return "/c/" + collection + "/" + id + "/edit";
}

export function newPath(collection: string, prefill?: { [key: string]: string }): string {
  const base = "/c/" + collection + "/new";
  if (!prefill) return base;
  const pairs = Object.entries(prefill).filter(([, value]) => value);
  if (pairs.length === 0) return base;
  const query = pairs
    .map(([key, value]) => encodeURIComponent(key) + "=" + encodeURIComponent(value))
    .join("&");
  return base + "?" + query;
}

export function parseRoute(path: string): Route {
  const [rawPath, rawQuery] = path.split("?");
  const parts = rawPath.split("/").filter(Boolean);

  if (parts.length === 0) return { name: "home" };
  if (parts[0] === "settings") return { name: "settings" };

  if (parts[0] === "c" && parts[1]) {
    const collection = decodeURIComponent(parts[1]);
    if (parts.length === 2) return { name: "list", collection };
    if (parts[2] === "new" && parts.length === 3) {
      const prefill: { [key: string]: string } = {};
      for (const pair of (rawQuery ?? "").split("&")) {
        if (!pair) continue;
        const eq = pair.indexOf("=");
        if (eq === -1) continue;
        prefill[decodeURIComponent(pair.slice(0, eq))] = decodeURIComponent(pair.slice(eq + 1));
      }
      return { name: "new", collection, prefill };
    }
    const id = decodeURIComponent(parts[2]);
    if (parts.length === 3) return { name: "detail", collection, id };
    if (parts.length === 4 && parts[3] === "edit") return { name: "edit", collection, id };
  }

  return { name: "unknown", path: rawPath };
}

export function useRoute(): Route {
  const path = useSyncExternalStore(
    routeStore.subscribe,
    routeStore.getSnapshot,
    routeStore.getSnapshot,
  );
  return parseRoute(path);
}

export function useRoutePath(): string {
  return useSyncExternalStore(routeStore.subscribe, routeStore.getSnapshot, routeStore.getSnapshot);
}
`,
  },
  "src/kernel/validate.ts": {
    purpose: "Schema-driven validation and value coercion.",
    exports: "validateField, validateRow, hasErrors, coerceValue, emptyValues, Errors",
    editable: false,
    content: `// Validation is derived from the schema, so a rule is declared once and the
// form, the CSV import and any programmatic write all get the same answer.

import type { Collection, Field } from "./types";

export type Errors = { [field: string]: string };

// Deliberately permissive. A stricter pattern rejects real addresses, and the
// consequence of a typo here is a bounced email the owner can fix — the
// consequence of a false rejection is a client they cannot save at all.
const EMAIL = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;

export function validateField(field: Field, raw: unknown): string {
  const value = typeof raw === "string" ? raw.trim() : raw;
  const empty = value === "" || value === null || value === undefined;

  if (field.required && field.kind !== "checkbox" && empty) {
    return field.label + " is required.";
  }
  if (empty) return "";

  switch (field.kind) {
    case "email":
      return EMAIL.test(String(value)) ? "" : "That does not look like an email address.";
    case "url":
      try {
        const url = new URL(String(value));
        return url.protocol === "http:" || url.protocol === "https:"
          ? ""
          : "Use a http:// or https:// address.";
      } catch {
        return "That does not look like a web address.";
      }
    case "number":
    case "currency":
      return Number.isFinite(Number(value)) ? "" : "Enter a number.";
    case "date":
      return /^\\d{4}-\\d{2}-\\d{2}$/.test(String(value)) ? "" : "Enter a date.";
    case "select":
      return !field.options || field.options.includes(String(value))
        ? ""
        : "Pick one of the listed options.";
    default:
      return String(value).length > 5000 ? "That is too long to store." : "";
  }
}

export function validateRow(collection: Collection, values: { [key: string]: unknown }): Errors {
  const errors: Errors = {};
  for (const field of collection.fields) {
    const message = validateField(field, values[field.name]);
    if (message) errors[field.name] = message;
  }
  return errors;
}

export function hasErrors(errors: Errors): boolean {
  return Object.keys(errors).length > 0;
}

/** Coerce a form value to the type the schema declares before storing it. */
export function coerceValue(field: Field, raw: unknown): unknown {
  if (field.kind === "checkbox") return Boolean(raw);
  if (field.kind === "number" || field.kind === "currency") {
    if (raw === "" || raw === null || raw === undefined) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return typeof raw === "string" ? raw.trim() : (raw ?? "");
}

export function emptyValues(collection: Collection): { [key: string]: unknown } {
  const values: { [key: string]: unknown } = {};
  for (const field of collection.fields) {
    if (field.kind === "checkbox") values[field.name] = false;
    else if (field.kind === "select") values[field.name] = field.options?.[0] ?? "";
    else values[field.name] = "";
  }
  return values;
}
`,
  },
  "src/kernel/csv.ts": {
    purpose: "CSV export (formula-injection safe) and the download helper.",
    exports: "toCsv, downloadText, safeFilename",
    editable: false,
    content: `// CSV export, so the data can leave. That matters more here than in an app
// with a server behind it: this is the only copy, and an app that can only be
// escaped by retyping everything is a trap.

import type { AppSchema, Collection, Row } from "./types";
import { formatValue } from "./format";

function escapeCell(value: string): string {
  // A leading =, +, - or @ is executed as a formula by spreadsheet software.
  // Prefixing an apostrophe is the standard defence and is what a real export
  // has to do, because the values here came from a text box.
  const guarded = /^[=+\\-@\\t\\r]/.test(value) ? "'" + value : value;
  return /[",\\n\\r]/.test(guarded) ? '"' + guarded.replace(/"/g, '""') + '"' : guarded;
}

export function toCsv(schema: AppSchema, collection: Collection, rows: Row[]): string {
  const header = collection.fields.map((f) => escapeCell(f.label));
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      collection.fields
        .map((field) => escapeCell(formatValue(field, row[field.name], schema.currency)))
        .join(","),
    );
  }
  // CRLF, because that is what spreadsheet software on Windows expects.
  return lines.join("\\r\\n") + "\\r\\n";
}

/**
 * Offers a file to the browser. Returns false when the browser or the page's
 * sandbox refuses, which the caller must handle by showing the text instead —
 * a download button that silently does nothing is its own small betrayal.
 */
export function downloadText(filename: string, mime: string, text: string): boolean {
  try {
    const blob = new Blob([text], { type: mime + ";charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return true;
  } catch {
    return false;
  }
}

export function safeFilename(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "export"
  );
}
`,
  },
  "src/kernel/records.ts": {
    purpose: "Record helpers: titles, ref labels, list columns, search, sort, filter field.",
    exports: "recordTitle, refLabel, listColumns, searchRows, sortRows, filterField, defaultSort",
    editable: false,
    content: `// Record-level helpers shared by the list, the detail page and the form.

import type { AppSchema, Collection, Field, Row } from "./types";
import { collectionByKey } from "./types";
import { formatValue, parseDateOnly } from "./format";

export function recordTitle(collection: Collection, row: Row | undefined): string {
  if (!row) return "";
  const value = row[collection.titleField];
  const text = typeof value === "string" ? value.trim() : "";
  return text || "Untitled " + collection.singular.toLowerCase();
}

/** The display label for a ref value — the referenced record's own title. */
export function refLabel(schema: AppSchema, field: Field, value: unknown, rows: Row[]): string {
  if (!field.ref || typeof value !== "string" || !value) return "";
  const target = collectionByKey(schema, field.ref);
  if (!target) return "";
  const row = rows.find((r) => r.id === value);
  return row ? recordTitle(target, row) : "";
}

export function listColumns(collection: Collection): Field[] {
  const marked = collection.fields.filter((f) => f.inList);
  if (marked.length > 0) return marked;
  return collection.fields.slice(0, 4);
}

function haystack(schema: AppSchema, collection: Collection, row: Row): string {
  return collection.fields
    .map((field) => formatValue(field, row[field.name], schema.currency))
    .join(" ")
    .toLowerCase();
}

export function searchRows(
  schema: AppSchema,
  collection: Collection,
  rows: Row[],
  query: string,
): Row[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  const terms = needle.split(/\\s+/);
  return rows.filter((row) => {
    const text = haystack(schema, collection, row);
    return terms.every((term) => text.includes(term));
  });
}

function sortKey(field: Field | undefined, row: Row): string | number {
  if (!field) return String(row.createdAt ?? "");
  const value = row[field.name];
  if (field.kind === "number" || field.kind === "currency") {
    const n = Number(value);
    return Number.isFinite(n) ? n : Number.NEGATIVE_INFINITY;
  }
  if (field.kind === "date") {
    const date = typeof value === "string" ? parseDateOnly(value) : null;
    return date ? date.getTime() : Number.NEGATIVE_INFINITY;
  }
  if (field.kind === "checkbox") return value ? 1 : 0;
  return String(value ?? "").toLowerCase();
}

export function sortRows(
  collection: Collection,
  rows: Row[],
  fieldName: string,
  dir: "asc" | "desc",
): Row[] {
  const field = collection.fields.find((f) => f.name === fieldName);
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = sortKey(field, a);
    const right = sortKey(field, b);
    if (left === right) return String(a.createdAt).localeCompare(String(b.createdAt));
    if (typeof left === "number" && typeof right === "number") return (left - right) * sign;
    return String(left).localeCompare(String(right)) * sign;
  });
}

/** The first select field, which the list view offers as a filter. */
export function filterField(collection: Collection): Field | undefined {
  return collection.fields.find((f) => f.kind === "select" && Array.isArray(f.options));
}

export function defaultSort(collection: Collection): { field: string; dir: "asc" | "desc" } {
  return collection.sort ?? { field: collection.titleField, dir: "asc" };
}
`,
  },
  "src/kernel/ui.tsx": {
    purpose: "Every UI primitive: buttons, cards, badges, form controls, modal, toasts, stat tiles.",
    exports: "focusRing, Button, Card, Badge, PageHeader, EmptyState, FormField, TextInput, TextArea, SelectInput, CheckboxInput, Modal, ToastProvider, useToast, StatTile",
    editable: false,
    content: `// The primitive set. Every screen in the kernel is built from these, so
// restyling the app is mostly this one file.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cx } from "./cx";

export const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:focus-visible:outline-sky-400";

// ── button ───────────────────────────────────────────────────────────────────

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const buttonVariants: { [key in ButtonVariant]: string } = {
  primary:
    "bg-sky-700 text-white hover:bg-sky-800 dark:bg-sky-500 dark:text-neutral-950 dark:hover:bg-sky-400",
  secondary:
    "border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800",
  ghost:
    "text-neutral-600 hover:bg-neutral-200/70 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white",
  danger:
    "bg-red-700 text-white hover:bg-red-800 dark:bg-red-600 dark:hover:bg-red-500",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md";
};

export function Button({ variant = "primary", size = "md", className, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-2 text-sm",
        buttonVariants[variant],
        focusRing,
        className,
      )}
      {...props}
    />
  );
}

// ── surfaces ─────────────────────────────────────────────────────────────────

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cx(
        "rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900",
        className,
      )}
    >
      {children}
    </div>
  );
}

const badgeTones = {
  neutral: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  amber: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  red: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  sky: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
};

export type BadgeTone = keyof typeof badgeTones;

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        badgeTones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900 sm:text-2xl dark:text-white">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-neutral-300 bg-white/60 px-6 py-12 text-center dark:border-neutral-700 dark:bg-neutral-900/60">
      <p className="text-base font-medium text-neutral-900 dark:text-white">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600 dark:text-neutral-400">{body}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

// ── form controls ────────────────────────────────────────────────────────────

const controlBase =
  "w-full rounded-lg border bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-500";
const controlIdle = "border-neutral-300 dark:border-neutral-700";
const controlBad = "border-red-500 dark:border-red-500";

export function FormField({
  label,
  htmlFor,
  error,
  help,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  help?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-sm font-medium text-neutral-800 dark:text-neutral-200"
      >
        {label}
        {required ? (
          <span className="ml-1 text-red-600 dark:text-red-400" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children}
      {help && !error ? (
        <p id={htmlFor + "-help"} className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
          {help}
        </p>
      ) : null}
      {error ? (
        <p
          id={htmlFor + "-error"}
          className="mt-1.5 text-xs font-medium text-red-700 dark:text-red-400"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({
  invalid,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      className={cx(controlBase, invalid ? controlBad : controlIdle, focusRing, className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

export function TextArea({
  invalid,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      rows={4}
      className={cx(controlBase, invalid ? controlBad : controlIdle, focusRing, className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

export function SelectInput({
  invalid,
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select
      className={cx(controlBase, invalid ? controlBad : controlIdle, focusRing, className)}
      aria-invalid={invalid || undefined}
      {...props}
    >
      {children}
    </select>
  );
}

export function CheckboxInput({
  label,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const id = useId();
  return (
    <div className="flex items-center gap-2.5">
      <input
        id={props.id ?? id}
        type="checkbox"
        className={cx(
          "size-4 rounded border-neutral-400 text-sky-700 dark:border-neutral-600",
          focusRing,
          className,
        )}
        {...props}
      />
      <label
        htmlFor={props.id ?? id}
        className="text-sm text-neutral-800 select-none dark:text-neutral-200"
      >
        {label}
      </label>
    </div>
  );
}

// ── modal ────────────────────────────────────────────────────────────────────

export function Modal({
  title,
  open,
  onClose,
  children,
  footer,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const focusable = panel.current?.querySelector<HTMLElement>(
      "button, [href], input, select, textarea",
    );
    focusable?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      // Returning focus to whatever opened the dialog is the difference
      // between a keyboard user carrying on and losing their place entirely.
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-neutral-950/50 p-4 sm:items-center">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-lg rounded-xl border border-neutral-200 bg-white p-5 shadow-xl dark:border-neutral-800 dark:bg-neutral-900"
      >
        <h2 id={titleId} className="text-base font-semibold text-neutral-900 dark:text-white">
          {title}
        </h2>
        <div className="mt-3 text-sm text-neutral-700 dark:text-neutral-300">{children}</div>
        {footer ? <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  );
}

// ── toast ────────────────────────────────────────────────────────────────────

type Toast = { id: number; text: string; tone: "info" | "error" };

const ToastContext = createContext<((text: string, tone?: "info" | "error") => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((text: string, tone: "info" | "error" = "info") => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, text, tone }]);
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 4000);
  }, []);

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cx(
              "pointer-events-auto max-w-sm rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg",
              toast.tone === "error"
                ? "bg-red-700 text-white"
                : "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900",
            )}
          >
            {toast.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const push = useContext(ToastContext);
  if (!push) throw new Error("useToast must be used inside <ToastProvider>.");
  return push;
}

// ── dashboard furniture ──────────────────────────────────────────────────────

/** A headline number. Kernel-side so a dashboard is data, not layout code. */
export function StatTile({
  label,
  value,
  hint,
  onClick,
}: {
  label: string;
  value: string | number;
  hint?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase dark:text-neutral-400">
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums text-neutral-900 dark:text-white">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{hint}</p> : null}
    </>
  );

  const shell =
    "rounded-xl border border-neutral-200 bg-white p-4 text-left shadow-sm dark:border-neutral-800 dark:bg-neutral-900";

  if (!onClick) return <div className={shell}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(shell, "transition-colors hover:border-neutral-300 hover:bg-neutral-50 dark:hover:border-neutral-700 dark:hover:bg-neutral-800/60", focusRing)}
    >
      {body}
    </button>
  );
}
`,
  },
  "src/kernel/AppShell.tsx": {
    purpose: "Header, responsive nav, theme toggle, and the non-dismissible local-storage notice.",
    exports: "AppShell",
    editable: false,
    content: `import { useState, type ReactNode } from "react";
import type { AppSchema } from "./types";
import type { Brand } from "./brand";
import { cx } from "./cx";
import { useStore, useTheme } from "./hooks";
import { listPath, navigate, useRoutePath } from "./router";
import { focusRing } from "./ui";

type NavItem = { path: string; label: string };

function navItems(schema: AppSchema): NavItem[] {
  const items: NavItem[] = [{ path: "/", label: "Dashboard" }];
  for (const collection of schema.collections) {
    if (collection.nav === false) continue;
    items.push({ path: listPath(collection.key), label: collection.plural });
  }
  items.push({ path: "/settings", label: "Data" });
  return items;
}

function isActive(current: string, path: string): boolean {
  if (path === "/") return current === "/";
  return current === path || current.startsWith(path + "/");
}

function NavLink({
  item,
  current,
  onNavigate,
  block,
}: {
  item: NavItem;
  current: string;
  onNavigate: () => void;
  block?: boolean;
}) {
  const active = isActive(current, item.path);
  return (
    <a
      href={"#" + item.path}
      aria-current={active ? "page" : undefined}
      onClick={(event) => {
        // Let modified clicks (open in new tab) behave normally.
        if (event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault();
        navigate(item.path);
        onNavigate();
      }}
      className={cx(
        "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        block ? "block" : "",
        active
          ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
          : "text-neutral-600 hover:bg-neutral-200/70 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white",
        focusRing,
      )}
    >
      {item.label}
    </a>
  );
}

function SunMoon({ dark }: { dark: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="currentColor">
      {dark ? (
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
      ) : (
        <>
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 1.6v2.6M12 19.8v2.6M4.2 12H1.6M22.4 12h-2.6M5.6 5.6 3.8 3.8M20.2 20.2l-1.8-1.8M18.4 5.6l1.8-1.8M3.8 20.2l1.8-1.8" strokeWidth="1.8" stroke="currentColor" strokeLinecap="round" fill="none" />
        </>
      )}
    </svg>
  );
}

/**
 * The one sentence this whole app is honest or dishonest about. It is not
 * dismissible and it is on every screen, because the failure mode it guards
 * against — someone building a year of client history and then clearing their
 * browser cache — happens exactly once and cannot be undone.
 */
function StorageNotice() {
  const store = useStore();

  if (store.status !== "ready") {
    return (
      <div
        role="alert"
        className="border-b border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
      >
        <strong className="font-semibold">Nothing is being saved.</strong>{" "}
        {store.lastError ??
          "This browser is blocking local storage, so anything you enter will disappear when you close the tab."}
      </div>
    );
  }

  return null;
}

function StorageFooter({ brand }: { brand: Brand }) {
  return (
    <footer className="mt-12 border-t border-neutral-200 bg-neutral-100/70 dark:border-neutral-800 dark:bg-neutral-900/70">
      <div className="mx-auto max-w-5xl px-4 py-6 text-xs leading-relaxed text-neutral-600 sm:px-6 dark:text-neutral-400">
        <p>
          <strong className="font-semibold text-neutral-800 dark:text-neutral-200">
            Everything in {brand.appName} is stored in this browser, on this device.
          </strong>{" "}
          There is no account and no server. It is not backed up, it is not on your phone, nobody
          else can see it, and clearing your browsing data or site data will permanently delete it.
        </p>
        <p className="mt-2">
          <a
            href="#/settings"
            onClick={(event) => {
              event.preventDefault();
              navigate("/settings");
            }}
            className={cx(
              "rounded font-medium text-sky-800 underline underline-offset-2 hover:text-sky-950 dark:text-sky-300 dark:hover:text-sky-200",
              focusRing,
            )}
          >
            Export a backup
          </a>{" "}
          before you clear anything, change browser, or get a new computer.
        </p>
      </div>
    </footer>
  );
}

export function AppShell({
  schema,
  brand,
  children,
}: {
  schema: AppSchema;
  brand: Brand;
  children: ReactNode;
}) {
  const current = useRoutePath().split("?")[0];
  const [theme, toggleTheme] = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const items = navItems(schema);

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <StorageNotice />

      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/90 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
          <a
            href="#/"
            onClick={(event) => {
              event.preventDefault();
              navigate("/");
              setMenuOpen(false);
            }}
            className={cx(
              "mr-auto truncate rounded text-base font-semibold tracking-tight text-neutral-900 dark:text-white",
              focusRing,
            )}
          >
            {brand.appName}
          </a>

          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {items.map((item) => (
              <NavLink key={item.path} item={item} current={current} onNavigate={() => {}} />
            ))}
          </nav>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            className={cx(
              "rounded-lg p-2 text-neutral-600 hover:bg-neutral-200/70 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white",
              focusRing,
            )}
          >
            <SunMoon dark={theme === "dark"} />
          </button>

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="app-menu"
            className={cx(
              "rounded-lg p-2 text-neutral-600 hover:bg-neutral-200/70 hover:text-neutral-900 md:hidden dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white",
              focusRing,
            )}
          >
            <span className="sr-only">Menu</span>
            <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>

        {menuOpen ? (
          <nav
            id="app-menu"
            aria-label="Main"
            className="border-t border-neutral-200 px-4 py-2 md:hidden dark:border-neutral-800"
          >
            <div className="mx-auto flex max-w-5xl flex-col gap-1">
              {items.map((item) => (
                <NavLink
                  key={item.path}
                  item={item}
                  current={current}
                  block
                  onNavigate={() => setMenuOpen(false)}
                />
              ))}
            </div>
          </nav>
        ) : null}
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>

      <StorageFooter brand={brand} />
    </div>
  );
}
`,
  },
  "src/kernel/FieldControl.tsx": {
    purpose: "Renders one schema field as the right labelled control.",
    exports: "FieldControl",
    editable: false,
    content: `import type { AppSchema, Field, Row } from "./types";
import { collectionByKey } from "./types";
import { recordTitle } from "./records";
import { CheckboxInput, FormField, SelectInput, TextArea, TextInput } from "./ui";

const inputTypes: { [key: string]: string } = {
  text: "text",
  email: "email",
  tel: "tel",
  url: "url",
  date: "date",
  number: "number",
  currency: "number",
};

/** One schema field, rendered as the right labelled control. */
export function FieldControl({
  schema,
  field,
  value,
  error,
  refRows,
  currencyLabel,
  onChange,
}: {
  schema: AppSchema;
  field: Field;
  value: unknown;
  error?: string;
  /** Candidate records for a "ref" field. */
  refRows: Row[];
  currencyLabel: string;
  onChange: (next: unknown) => void;
}) {
  const id = "field-" + field.name;
  const describedBy = error ? id + "-error" : field.help ? id + "-help" : undefined;

  if (field.kind === "checkbox") {
    return (
      <div className="pt-1">
        <CheckboxInput
          id={id}
          label={field.label}
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
        />
        {field.help ? (
          <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">{field.help}</p>
        ) : null}
      </div>
    );
  }

  const label =
    field.kind === "currency" ? field.label + " (" + currencyLabel + ")" : field.label;

  return (
    <FormField
      label={label}
      htmlFor={id}
      error={error}
      help={field.help}
      required={field.required}
    >
      {field.kind === "textarea" ? (
        <TextArea
          id={id}
          value={typeof value === "string" ? value : ""}
          invalid={Boolean(error)}
          aria-describedby={describedBy}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : field.kind === "select" ? (
        <SelectInput
          id={id}
          value={typeof value === "string" ? value : ""}
          invalid={Boolean(error)}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        >
          {field.required ? null : <option value="">Not set</option>}
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </SelectInput>
      ) : field.kind === "ref" ? (
        <SelectInput
          id={id}
          value={typeof value === "string" ? value : ""}
          invalid={Boolean(error)}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Not linked</option>
          {refRows.map((row) => {
            const target = field.ref ? collectionByKey(schema, field.ref) : undefined;
            return (
              <option key={row.id} value={row.id}>
                {target ? recordTitle(target, row) : row.id}
              </option>
            );
          })}
        </SelectInput>
      ) : (
        <TextInput
          id={id}
          type={inputTypes[field.kind] ?? "text"}
          step={field.kind === "currency" ? "0.01" : undefined}
          inputMode={field.kind === "currency" || field.kind === "number" ? "decimal" : undefined}
          value={value === null || value === undefined ? "" : String(value)}
          invalid={Boolean(error)}
          aria-describedby={describedBy}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </FormField>
  );
}
`,
  },
  "src/kernel/CollectionList.tsx": {
    purpose: "List view for any collection: search, filter, sort, CSV export, table on desktop and cards on mobile.",
    exports: "CollectionList",
    editable: false,
    content: `import { useMemo, useState } from "react";
import type { AppSchema, Collection, Field, Row } from "./types";
import { collectionByKey } from "./types";
import { cx } from "./cx";
import { useCollection } from "./hooks";
import { detailPath, navigate, newPath } from "./router";
import { formatValue } from "./format";
import {
  defaultSort,
  filterField,
  listColumns,
  recordTitle,
  searchRows,
  sortRows,
} from "./records";
import { downloadText, safeFilename, toCsv } from "./csv";
import { Badge, Button, Card, EmptyState, PageHeader, TextInput, SelectInput, focusRing, useToast } from "./ui";

function CellValue({
  schema,
  field,
  row,
}: {
  schema: AppSchema;
  field: Field;
  row: Row;
}) {
  const refRows = useCollection(field.kind === "ref" && field.ref ? field.ref : "__none__");
  const value = row[field.name];

  if (field.kind === "ref") {
    const target = field.ref ? collectionByKey(schema, field.ref) : undefined;
    const linked = refRows.find((r) => r.id === value);
    if (!target || !linked) {
      return <span className="text-neutral-400 dark:text-neutral-600">—</span>;
    }
    return (
      <a
        href={"#" + detailPath(target.key, linked.id)}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          navigate(detailPath(target.key, linked.id));
        }}
        className={cx(
          "rounded underline underline-offset-2 hover:text-sky-800 dark:hover:text-sky-300",
          focusRing,
        )}
      >
        {recordTitle(target, linked)}
      </a>
    );
  }

  if (field.kind === "select" && typeof value === "string" && value) {
    return <Badge>{value}</Badge>;
  }

  const text = formatValue(field, value, schema.currency);
  if (!text) return <span className="text-neutral-400 dark:text-neutral-600">—</span>;
  return <span>{text}</span>;
}

/**
 * List, search, filter, sort and export for any collection in the schema.
 * The table is a table on a real screen and a stack of cards under 640px —
 * a horizontally scrolling table on a phone is how these apps become
 * unusable in a van, which is where a sole trader actually opens them.
 */
export function CollectionList({
  schema,
  collection,
}: {
  schema: AppSchema;
  collection: Collection;
}) {
  const rows = useCollection(collection.key);
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [filterValue, setFilterValue] = useState("");
  const initial = defaultSort(collection);
  const [sort, setSort] = useState(initial);

  const columns = listColumns(collection);
  const filter = filterField(collection);

  const visible = useMemo(() => {
    let result = rows;
    if (filter && filterValue) {
      result = result.filter((row) => row[filter.name] === filterValue);
    }
    result = searchRows(schema, collection, result, query);
    return sortRows(collection, result, sort.field, sort.dir);
  }, [rows, filter, filterValue, query, sort, schema, collection]);

  function toggleSort(name: string) {
    setSort((current) =>
      current.field === name
        ? { field: name, dir: current.dir === "asc" ? "desc" : "asc" }
        : { field: name, dir: "asc" },
    );
  }

  function exportCsv() {
    const ok = downloadText(
      safeFilename(collection.plural) + ".csv",
      "text/csv",
      toCsv(schema, collection, visible),
    );
    toast(
      ok
        ? "Exported " + visible.length + " " + collection.plural.toLowerCase() + "."
        : "This browser blocked the download. Use Data → Export instead.",
      ok ? "info" : "error",
    );
  }

  const addButton = (
    <Button onClick={() => navigate(newPath(collection.key))}>
      New {collection.singular.toLowerCase()}
    </Button>
  );

  return (
    <div>
      <PageHeader
        title={collection.plural}
        subtitle={
          rows.length === 1
            ? "1 " + collection.singular.toLowerCase()
            : rows.length + " " + collection.plural.toLowerCase()
        }
        actions={
          <>
            {rows.length > 0 ? (
              <Button variant="secondary" onClick={exportCsv}>
                Export CSV
              </Button>
            ) : null}
            {addButton}
          </>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title={"No " + collection.plural.toLowerCase() + " yet"}
          body={
            collection.emptyHint ??
            "Add your first " + collection.singular.toLowerCase() + " to get started."
          }
          action={addButton}
        />
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row">
            <TextInput
              type="search"
              value={query}
              aria-label={"Search " + collection.plural.toLowerCase()}
              placeholder={"Search " + collection.plural.toLowerCase()}
              onChange={(event) => setQuery(event.target.value)}
              className="sm:max-w-xs"
            />
            {filter ? (
              <SelectInput
                value={filterValue}
                aria-label={"Filter by " + filter.label.toLowerCase()}
                onChange={(event) => setFilterValue(event.target.value)}
                className="sm:max-w-45"
              >
                <option value="">All {filter.label.toLowerCase()}</option>
                {(filter.options ?? []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </SelectInput>
            ) : null}
          </div>

          {visible.length === 0 ? (
            <EmptyState
              title="Nothing matches"
              body="No records match that search. Try fewer words, or clear the filter."
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery("");
                    setFilterValue("");
                  }}
                >
                  Clear search
                </Button>
              }
            />
          ) : (
            <Card className="overflow-hidden">
              {/* Table for real screens. */}
              <table className="hidden w-full text-left text-sm sm:table">
                <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950/50 dark:text-neutral-400">
                  <tr>
                    {columns.map((field) => {
                      const active = sort.field === field.name;
                      return (
                        <th key={field.name} scope="col" className="px-4 py-3 font-medium">
                          <button
                            type="button"
                            onClick={() => toggleSort(field.name)}
                            aria-label={"Sort by " + field.label}
                            className={cx("rounded inline-flex items-center gap-1", focusRing)}
                          >
                            {field.label}
                            <span aria-hidden="true" className={active ? "" : "opacity-0"}>
                              {sort.dir === "asc" ? "↑" : "↓"}
                            </span>
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {visible.map((row) => (
                    <tr
                      key={row.id}
                      className="cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                      onClick={() => navigate(detailPath(collection.key, row.id))}
                    >
                      {columns.map((field, index) => (
                        <td key={field.name} className="px-4 py-3 align-top">
                          {index === 0 ? (
                            <a
                              href={"#" + detailPath(collection.key, row.id)}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                navigate(detailPath(collection.key, row.id));
                              }}
                              className={cx(
                                "rounded font-medium text-neutral-900 underline-offset-2 hover:underline dark:text-white",
                                focusRing,
                              )}
                            >
                              {recordTitle(collection, row)}
                            </a>
                          ) : (
                            <span className="text-neutral-700 dark:text-neutral-300">
                              <CellValue schema={schema} field={field} row={row} />
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Cards below 640px. */}
              <ul className="divide-y divide-neutral-200 sm:hidden dark:divide-neutral-800">
                {visible.map((row) => (
                  <li key={row.id}>
                    <a
                      href={"#" + detailPath(collection.key, row.id)}
                      onClick={(event) => {
                        event.preventDefault();
                        navigate(detailPath(collection.key, row.id));
                      }}
                      className={cx(
                        "block px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/50",
                        focusRing,
                      )}
                    >
                      <p className="font-medium text-neutral-900 dark:text-white">
                        {recordTitle(collection, row)}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-600 dark:text-neutral-400">
                        {columns.slice(1).map((field) => (
                          <span key={field.name} className="inline-flex items-center gap-1">
                            <span className="text-neutral-400 dark:text-neutral-500">
                              {field.label}:
                            </span>
                            <CellValue schema={schema} field={field} row={row} />
                          </span>
                        ))}
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
`,
  },
  "src/kernel/RecordDetail.tsx": {
    purpose: "Detail view for any record, with related child collections and delete confirmation.",
    exports: "RecordDetail, MissingRecord",
    editable: false,
    content: `import { useState, type ReactNode } from "react";
import type { AppSchema, Collection, Field, Row } from "./types";
import { collectionByKey } from "./types";
import { cx } from "./cx";
import { useCollection, useStore } from "./hooks";
import { detailPath, editPath, listPath, navigate, newPath } from "./router";
import { formatDateTime, formatValue } from "./format";
import { recordTitle, sortRows, defaultSort } from "./records";
import { Badge, Button, Card, EmptyState, Modal, PageHeader, focusRing, useToast } from "./ui";

function FieldRow({
  schema,
  field,
  row,
}: {
  schema: AppSchema;
  field: Field;
  row: Row;
}) {
  const refRows = useCollection(field.kind === "ref" && field.ref ? field.ref : "__none__");
  const value = row[field.name];
  const empty = value === "" || value === null || value === undefined;

  let rendered: ReactNode;
  if (field.kind === "ref") {
    const target = field.ref ? collectionByKey(schema, field.ref) : undefined;
    const linked = refRows.find((r) => r.id === value);
    rendered =
      target && linked ? (
        <a
          href={"#" + detailPath(target.key, linked.id)}
          onClick={(event) => {
            event.preventDefault();
            navigate(detailPath(target.key, linked.id));
          }}
          className={cx("rounded underline underline-offset-2", focusRing)}
        >
          {recordTitle(target, linked)}
        </a>
      ) : null;
  } else if (field.kind === "select" && !empty) {
    rendered = <Badge>{String(value)}</Badge>;
  } else if (field.kind === "email" && !empty) {
    rendered = (
      <a
        href={"mailto:" + String(value)}
        className={cx("rounded underline underline-offset-2", focusRing)}
      >
        {String(value)}
      </a>
    );
  } else if (field.kind === "tel" && !empty) {
    rendered = (
      <a
        href={"tel:" + String(value).replace(/\\s+/g, "")}
        className={cx("rounded underline underline-offset-2", focusRing)}
      >
        {String(value)}
      </a>
    );
  } else if (field.kind === "url" && !empty) {
    rendered = (
      <a
        href={String(value)}
        rel="noreferrer noopener"
        target="_blank"
        className={cx("rounded underline underline-offset-2 break-all", focusRing)}
      >
        {String(value)}
      </a>
    );
  } else if (field.kind === "textarea" && !empty) {
    rendered = <span className="whitespace-pre-wrap">{String(value)}</span>;
  } else {
    const text = formatValue(field, value, schema.currency);
    rendered = text || null;
  }

  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-sm text-neutral-500 dark:text-neutral-400">{field.label}</dt>
      <dd className="text-sm text-neutral-900 dark:text-neutral-100">
        {rendered ?? <span className="text-neutral-400 dark:text-neutral-600">Not set</span>}
      </dd>
    </div>
  );
}

function RelatedList({
  schema,
  parent,
  parentId,
  spec,
}: {
  schema: AppSchema;
  parent: Collection;
  parentId: string;
  spec: { collection: string; via: string };
}) {
  const child = collectionByKey(schema, spec.collection);
  const rows = useCollection(spec.collection);
  if (!child) return null;

  const mine = sortRows(
    child,
    rows.filter((row) => row[spec.via] === parentId),
    defaultSort(child).field,
    defaultSort(child).dir,
  );

  const columns = child.fields.filter((f) => f.name !== spec.via).slice(0, 3);

  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">{child.plural}</h2>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => navigate(newPath(child.key, { [spec.via]: parentId }))}
        >
          Add {child.singular.toLowerCase()}
        </Button>
      </div>
      {mine.length === 0 ? (
        <p className="py-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
          No {child.plural.toLowerCase()} logged against this{" "}
          {parent.singular.toLowerCase()} yet.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {mine.map((row) => (
            <li key={row.id}>
              <a
                href={"#" + detailPath(child.key, row.id)}
                onClick={(event) => {
                  event.preventDefault();
                  navigate(detailPath(child.key, row.id));
                }}
                className={cx(
                  "-mx-2 block rounded px-2 py-2.5 hover:bg-neutral-50 dark:hover:bg-neutral-800/50",
                  focusRing,
                )}
              >
                <p className="text-sm font-medium text-neutral-900 dark:text-white">
                  {recordTitle(child, row)}
                </p>
                <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-neutral-600 dark:text-neutral-400">
                  {columns
                    .filter((field) => field.name !== child.titleField)
                    .map((field) => {
                      const text = formatValue(field, row[field.name], schema.currency);
                      if (!text) return null;
                      return <span key={field.name}>{text}</span>;
                    })}
                </p>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function RecordDetail({
  schema,
  collection,
  row,
}: {
  schema: AppSchema;
  collection: Collection;
  row: Row;
}) {
  const store = useStore();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);

  function remove() {
    store.remove(collection.key, row.id);
    setConfirming(false);
    toast(collection.singular + " deleted.");
    navigate(listPath(collection.key));
  }

  return (
    <div>
      <a
        href={"#" + listPath(collection.key)}
        onClick={(event) => {
          event.preventDefault();
          navigate(listPath(collection.key));
        }}
        className={cx(
          "mb-4 inline-flex items-center gap-1 rounded text-sm text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white",
          focusRing,
        )}
      >
        <span aria-hidden="true">←</span> {collection.plural}
      </a>

      <PageHeader
        title={recordTitle(collection, row)}
        subtitle={"Last changed " + formatDateTime(row.updatedAt)}
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate(editPath(collection.key, row.id))}>
              Edit
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(true)}>
              Delete
            </Button>
          </>
        }
      />

      <Card className="p-4 sm:p-6">
        <dl className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {collection.fields.map((field) => (
            <FieldRow key={field.name} schema={schema} field={field} row={row} />
          ))}
        </dl>
      </Card>

      {(collection.related ?? []).length > 0 ? (
        <div className="mt-6 grid gap-6">
          {(collection.related ?? []).map((spec) => (
            <RelatedList
              key={spec.collection + spec.via}
              schema={schema}
              parent={collection}
              parentId={row.id}
              spec={spec}
            />
          ))}
        </div>
      ) : null}

      <Modal
        title={"Delete this " + collection.singular.toLowerCase() + "?"}
        open={confirming}
        onClose={() => setConfirming(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
            <Button variant="danger" onClick={remove}>
              Delete
            </Button>
          </>
        }
      >
        <p>
          <strong>{recordTitle(collection, row)}</strong> will be removed from this browser. There
          is no server copy and no undo — if you have not exported a backup, it is gone.
        </p>
      </Modal>
    </div>
  );
}

export function MissingRecord({ collection }: { collection: Collection }) {
  return (
    <EmptyState
      title={"That " + collection.singular.toLowerCase() + " is not here"}
      body={
        "It may have been deleted, or the link may be from a different browser — records are not shared between devices."
      }
      action={
        <Button onClick={() => navigate(listPath(collection.key))}>
          Back to {collection.plural.toLowerCase()}
        </Button>
      }
    />
  );
}
`,
  },
  "src/kernel/RecordForm.tsx": {
    purpose: "Create and edit form generated from the schema.",
    exports: "RecordForm",
    editable: false,
    content: `import { useMemo, useState } from "react";
import type { AppSchema, Collection, Row } from "./types";
import { collectionByKey } from "./types";
import { useCollection, useStore } from "./hooks";
import { detailPath, listPath, navigate } from "./router";
import { recordTitle } from "./records";
import { coerceValue, emptyValues, hasErrors, validateRow, type Errors } from "./validate";
import { FieldControl } from "./FieldControl";
import { Button, Card, PageHeader, useToast } from "./ui";

const EMPTY_ROWS: Row[] = [];

/**
 * Create and edit, generated entirely from the schema. There is no
 * per-collection form anywhere in this app — adding a field to src/app/schema.ts
 * is the whole change.
 */
export function RecordForm({
  schema,
  collection,
  existing,
  prefill,
}: {
  schema: AppSchema;
  collection: Collection;
  existing?: Row;
  prefill?: { [key: string]: string };
}) {
  const store = useStore();
  const toast = useToast();

  const [values, setValues] = useState<{ [key: string]: unknown }>(() => {
    const base = emptyValues(collection);
    if (existing) {
      for (const field of collection.fields) {
        if (field.name in existing) base[field.name] = existing[field.name];
      }
    } else if (prefill) {
      for (const [key, value] of Object.entries(prefill)) {
        if (collection.fields.some((f) => f.name === key)) base[key] = value;
      }
    }
    return base;
  });
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState(false);

  const editing = Boolean(existing);
  const heading = editing
    ? "Edit " + recordTitle(collection, existing)
    : "New " + collection.singular.toLowerCase();

  function set(name: string, next: unknown) {
    setValues((current) => ({ ...current, [name]: next }));
    if (touched) {
      setErrors(validateRow(collection, { ...values, [name]: next }));
    }
  }

  function submit() {
    setTouched(true);
    const found = validateRow(collection, values);
    setErrors(found);
    if (hasErrors(found)) {
      toast("Some fields need attention.", "error");
      return;
    }

    const clean: { [key: string]: unknown } = {};
    for (const field of collection.fields) clean[field.name] = coerceValue(field, values[field.name]);

    if (existing) {
      store.update(collection.key, existing.id, clean);
      toast(collection.singular + " saved.");
      navigate(detailPath(collection.key, existing.id));
      return;
    }
    const row = store.create(collection.key, clean);
    if (store.status !== "ready") {
      toast("Saved to the page, but this browser refused to store it.", "error");
    } else {
      toast(collection.singular + " added.");
    }
    navigate(detailPath(collection.key, row.id));
  }

  const cancelTo = existing ? detailPath(collection.key, existing.id) : listPath(collection.key);

  return (
    <div>
      <PageHeader title={heading} />
      <Card className="p-5 sm:p-6">
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="grid gap-5 sm:grid-cols-2">
            {collection.fields.map((field) => (
              <div
                key={field.name}
                className={field.kind === "textarea" ? "sm:col-span-2" : undefined}
              >
                <RefAwareControl
                  schema={schema}
                  collection={collection}
                  fieldName={field.name}
                  values={values}
                  errors={errors}
                  onChange={set}
                />
              </div>
            ))}
          </div>

          <div className="mt-7 flex flex-wrap gap-2 border-t border-neutral-200 pt-5 dark:border-neutral-800">
            <Button type="submit">{editing ? "Save changes" : "Add " + collection.singular.toLowerCase()}</Button>
            <Button variant="secondary" onClick={() => navigate(cancelTo)}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

/**
 * Split out because a ref field needs the rows of ANOTHER collection, and a
 * hook cannot be called inside the fields.map above.
 */
function RefAwareControl({
  schema,
  collection,
  fieldName,
  values,
  errors,
  onChange,
}: {
  schema: AppSchema;
  collection: Collection;
  fieldName: string;
  values: { [key: string]: unknown };
  errors: Errors;
  onChange: (name: string, next: unknown) => void;
}) {
  const field = collection.fields.find((f) => f.name === fieldName);
  const refKey = field?.kind === "ref" && field.ref ? field.ref : "__none__";
  const rows = useCollection(refKey);
  const target = field?.ref ? collectionByKey(schema, field.ref) : undefined;

  const sorted = useMemo(() => {
    if (!target) return EMPTY_ROWS;
    return [...rows].sort((a, b) =>
      recordTitle(target, a).localeCompare(recordTitle(target, b)),
    );
  }, [rows, target]);

  if (!field) return null;

  return (
    <FieldControl
      schema={schema}
      field={field}
      value={values[field.name]}
      error={errors[field.name]}
      refRows={sorted}
      currencyLabel={schema.currency}
      onChange={(next) => onChange(field.name, next)}
    />
  );
}
`,
  },
  "src/kernel/DataSettings.tsx": {
    purpose: "Backup, restore, delete-everything, and the plain-words explanation of where data lives.",
    exports: "DataSettings",
    editable: false,
    content: `import { useState } from "react";
import type { AppSchema } from "./types";
import type { Brand } from "./brand";
import { useSnapshot, useStore } from "./hooks";
import { coerceSnapshot } from "./store";
import { downloadText, safeFilename } from "./csv";
import { formatBytes, formatDateTime, todayIso } from "./format";
import { Button, Card, Modal, PageHeader, TextArea, TextInput, useToast } from "./ui";

/**
 * The backup, restore and delete screen — and the page that explains, in
 * plain words, exactly what "stored in this browser" means. It is reachable
 * from the footer of every screen because the moment a user needs it is the
 * moment before they clear their cache, not after.
 */
export function DataSettings({ schema, brand }: { schema: AppSchema; brand: Brand }) {
  const store = useStore();
  const snapshot = useSnapshot();
  const toast = useToast();

  const [showJson, setShowJson] = useState(false);
  const [importText, setImportText] = useState("");
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [wipeWord, setWipeWord] = useState("");

  const json = store.exportJson();
  const filename = safeFilename(brand.appName) + "-backup-" + todayIso() + ".json";

  function exportFile() {
    const ok = downloadText(filename, "application/json", json);
    if (ok) {
      toast("Backup downloaded.");
    } else {
      setShowJson(true);
      toast("This browser blocked the download — copy the text instead.", "error");
    }
  }

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(json);
      toast("Backup copied to the clipboard.");
    } catch {
      setShowJson(true);
      toast("Could not copy. Select the text below and copy it by hand.", "error");
    }
  }

  function runImport() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(importText);
    } catch {
      toast("That is not valid backup JSON.", "error");
      return;
    }
    const next = coerceSnapshot(schema, parsed);
    const total = Object.values(next.collections).reduce((sum, rows) => sum + rows.length, 0);
    if (total === 0) {
      toast("That backup has no records in it — nothing was changed.", "error");
      return;
    }
    store.replaceAll(next);
    setImportText("");
    toast("Restored " + total + " records, replacing what was here.");
  }

  function runWipe() {
    store.wipe();
    setConfirmWipe(false);
    setWipeWord("");
    toast("Everything deleted.");
  }

  return (
    <div>
      <PageHeader
        title="Your data"
        subtitle={"Where it lives, how to back it up, and how to remove it."}
      />

      <div className="grid gap-6">
        <Card className="p-5 sm:p-6">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
            Where this data actually lives
          </h2>
          <div className="mt-3 space-y-3 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
            <p>
              {brand.appName} has no account and no server. Every record you enter is written to
              this one browser&rsquo;s local storage, on this one device. That has real
              consequences, and none of them are hidden:
            </p>
            <ul className="ml-5 list-disc space-y-1.5">
              <li>
                <strong>It is not backed up.</strong> If this device is lost, stolen or wiped, so is
                the data.
              </li>
              <li>
                <strong>It is not on your other devices.</strong> Opening the same link on your
                phone shows an empty app, not this one.
              </li>
              <li>
                <strong>Clearing browsing data deletes it.</strong> &ldquo;Clear cookies and site
                data&rdquo;, a privacy cleaner, or a browser reset will remove it with no warning
                and no recovery.
              </li>
              <li>
                <strong>Nobody else can see it</strong> — which is also why nobody else can help you
                get it back.
              </li>
            </ul>
            <p className="font-medium text-neutral-900 dark:text-white">
              Export a backup regularly. It is the only copy that survives any of the above.
            </p>
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">Back up</h2>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            {store.countAll()} records, {formatBytes(store.usedBytes())}. Last saved{" "}
            {formatDateTime(snapshot.savedAt)}.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={exportFile}>Download backup</Button>
            <Button variant="secondary" onClick={copyJson}>
              Copy to clipboard
            </Button>
            <Button variant="ghost" onClick={() => setShowJson((open) => !open)}>
              {showJson ? "Hide" : "Show"} the raw file
            </Button>
          </div>
          {showJson ? (
            <TextArea
              readOnly
              rows={10}
              value={json}
              aria-label="Backup file contents"
              className="mt-4 font-mono text-xs"
            />
          ) : null}
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
            Restore from a backup
          </h2>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Paste a backup file below. This <strong>replaces</strong> everything currently in this
            browser — it does not merge.
          </p>
          <TextArea
            rows={5}
            value={importText}
            placeholder="Paste the contents of a backup file here"
            aria-label="Backup file to restore"
            className="mt-3 font-mono text-xs"
            onChange={(event) => setImportText(event.target.value)}
          />
          <div className="mt-3">
            <Button variant="secondary" disabled={!importText.trim()} onClick={runImport}>
              Replace everything with this backup
            </Button>
          </div>
        </Card>

        <Card className="border-red-200 p-5 sm:p-6 dark:border-red-900">
          <h2 className="text-sm font-semibold text-red-800 dark:text-red-300">Delete everything</h2>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Removes every record from this browser. There is no server copy, so this cannot be
            undone.
          </p>
          <div className="mt-4">
            <Button variant="danger" onClick={() => setConfirmWipe(true)}>
              Delete all data
            </Button>
          </div>
        </Card>
      </div>

      <Modal
        title="Delete everything in this browser?"
        open={confirmWipe}
        onClose={() => {
          setConfirmWipe(false);
          setWipeWord("");
        }}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setConfirmWipe(false);
                setWipeWord("");
              }}
            >
              Cancel
            </Button>
            <Button variant="danger" disabled={wipeWord.trim().toUpperCase() !== "DELETE"} onClick={runWipe}>
              Delete everything
            </Button>
          </>
        }
      >
        <p>
          This removes all {store.countAll()} records. There is no backup on a server and no undo.
        </p>
        <label htmlFor="wipe-confirm" className="mt-4 mb-1.5 block text-sm font-medium">
          Type DELETE to confirm
        </label>
        <TextInput
          id="wipe-confirm"
          value={wipeWord}
          autoComplete="off"
          onChange={(event) => setWipeWord(event.target.value)}
        />
      </Modal>
    </div>
  );
}
`,
  },
  "src/kernel/AppRoutes.tsx": {
    purpose: "Maps the current route to a kernel screen.",
    exports: "AppRoutes",
    editable: false,
    content: `import type { ReactNode } from "react";
import type { AppSchema } from "./types";
import { collectionByKey } from "./types";
import type { Brand } from "./brand";
import { useCollection } from "./hooks";
import { navigate, useRoute } from "./router";
import { CollectionList } from "./CollectionList";
import { RecordDetail, MissingRecord } from "./RecordDetail";
import { RecordForm } from "./RecordForm";
import { DataSettings } from "./DataSettings";
import { Button, EmptyState } from "./ui";

/**
 * Every screen the kernel provides, chosen by the current route. The only
 * thing an app supplies is its dashboard — everything else here is generated
 * from the schema.
 */
export function AppRoutes({
  schema,
  brand,
  dashboard,
}: {
  schema: AppSchema;
  brand: Brand;
  dashboard: ReactNode;
}) {
  const route = useRoute();

  if (route.name === "home") return <>{dashboard}</>;
  if (route.name === "settings") return <DataSettings schema={schema} brand={brand} />;

  if (route.name === "unknown") {
    return (
      <EmptyState
        title="Page not found"
        body={"There is nothing at " + route.path + " in this app."}
        action={<Button onClick={() => navigate("/")}>Back to the dashboard</Button>}
      />
    );
  }

  const collection = collectionByKey(schema, route.collection);
  if (!collection) {
    return (
      <EmptyState
        title="Unknown section"
        body={"This app has no “" + route.collection + "” section."}
        action={<Button onClick={() => navigate("/")}>Back to the dashboard</Button>}
      />
    );
  }

  if (route.name === "list") return <CollectionList schema={schema} collection={collection} />;
  if (route.name === "new") {
    return <RecordForm schema={schema} collection={collection} prefill={route.prefill} />;
  }
  return <RecordScreen schema={schema} collectionKey={collection.key} id={route.id} edit={route.name === "edit"} />;
}

function RecordScreen({
  schema,
  collectionKey,
  id,
  edit,
}: {
  schema: AppSchema;
  collectionKey: string;
  id: string;
  edit: boolean;
}) {
  const rows = useCollection(collectionKey);
  const collection = collectionByKey(schema, collectionKey);
  const row = rows.find((r) => r.id === id);

  if (!collection) return null;
  if (!row) return <MissingRecord collection={collection} />;
  if (edit) return <RecordForm schema={schema} collection={collection} existing={row} />;
  return <RecordDetail schema={schema} collection={collection} row={row} />;
}
`,
  },
};
