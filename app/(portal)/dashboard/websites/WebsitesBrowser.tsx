"use client";

import { useEffect, useMemo, useState } from "react";
import { LayoutGrid, List, Search } from "lucide-react";
import { WebsiteCard } from "@/components/app/WebsiteCard";
import type { WebsiteCardProject } from "@/components/app/WebsiteCard";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchInput, Select } from "@/components/ui/Field";
import { Segmented } from "@/components/ui/Segmented";
import type { SortKey, StatusFilter, ViewMode, WebsiteParams } from "./data";

/* Grid/list, search, sort and filter over the customer's own site list.
 *
 * Filtering happens in the BROWSER, over the full list the server already
 * sent. This is a personal collection — the biggest realistic account has
 * tens of sites, not thousands — and doing it here buys instant feedback on
 * every keystroke with no round trip and no loading state to design. If a
 * customer ever has enough sites for this to matter, the honest fix is
 * pagination on the server, not a debounced query against the same list.
 *
 * The URL still carries the state, via history.replaceState rather than
 * router.replace: it makes a filtered view shareable and survives a reload,
 * without re-running the server component (and re-querying Postgres) on every
 * keystroke. The server reads those same params to seed the initial state, so
 * a pasted link renders correctly on the first paint. */

const STATUS_LABEL: Record<StatusFilter, string> = {
  all: "All sites",
  published: "Published",
  draft: "Drafts",
  building: "Building now",
};

const SORT_LABEL: Record<SortKey, string> = {
  updated: "Last updated",
  created: "Recently created",
  name: "Name (A–Z)",
};

const VIEW_OPTIONS = [
  { value: "grid" as const, label: "Grid", iconOnly: true, icon: <LayoutGrid className="size-4" /> },
  { value: "list" as const, label: "List", iconOnly: true, icon: <List className="size-4" /> },
];

function matches(site: WebsiteCardProject, status: StatusFilter, needle: string): boolean {
  if (status === "published" && !site.published) return false;
  if (status === "draft" && site.published) return false;
  if (status === "building" && !site.building) return false;
  if (needle === "") return true;
  return site.name.toLowerCase().includes(needle) || site.slug.toLowerCase().includes(needle);
}

export default function WebsitesBrowser({
  sites,
  initial,
  staleMinutes,
}: {
  sites: WebsiteCardProject[];
  initial: WebsiteParams;
  staleMinutes: number;
}) {
  const [view, setView] = useState<ViewMode>(initial.view);
  const [sort, setSort] = useState<SortKey>(initial.sort);
  const [status, setStatus] = useState<StatusFilter>(initial.status);
  const [query, setQuery] = useState(initial.q);

  useEffect(() => {
    const params = new URLSearchParams();
    if (view !== "grid") params.set("view", view);
    if (sort !== "updated") params.set("sort", sort);
    if (status !== "all") params.set("status", status);
    const trimmed = query.trim();
    if (trimmed) params.set("q", trimmed);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [view, sort, status, query]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = sites.filter((s) => matches(s, status, needle));
    return list.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "en");
      if (sort === "created") return b.createdAt - a.createdAt;
      return b.updatedAt - a.updatedAt;
    });
  }, [sites, status, query, sort]);

  const buildingCount = sites.filter((s) => s.building).length;
  const filtered = status !== "all" || query.trim() !== "";

  function clearFilters() {
    setStatus("all");
    setQuery("");
  }

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or address"
          aria-label="Search your websites"
          className="sm:max-w-xs sm:flex-1"
        />

        <div className="flex items-center gap-2 sm:ml-auto">
          <Select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className="min-w-40"
          >
            {(Object.keys(STATUS_LABEL) as StatusFilter[]).map((key) => (
              <option key={key} value={key}>
                {STATUS_LABEL[key]}
                {key === "building" && buildingCount > 0 ? ` (${buildingCount})` : ""}
              </option>
            ))}
          </Select>

          <Select
            aria-label="Sort websites"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="min-w-44"
          >
            {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
              <option key={key} value={key}>
                {SORT_LABEL[key]}
              </option>
            ))}
          </Select>

          <Segmented
            name="websites-view"
            ariaLabel="View as"
            value={view}
            onChange={setView}
            options={VIEW_OPTIONS}
            className="shrink-0"
          />
        </div>
      </div>

      <p className="mt-3 text-xs text-ink-3" aria-live="polite">
        <span className="k-num">
          {visible.length} of {sites.length}
        </span>{" "}
        {sites.length === 1 ? "site" : "sites"}
        {/* The one fact from the old "About this page" list that had nowhere
            else to live. It belongs HERE — beside the filter it qualifies —
            rather than in a footnote at the bottom of the page nobody reads
            while wondering why a site they know is building isn't listed. A
            RUNNING build row is never cleaned up if its connection drops, so
            "Building" has to expire on a clock or it would be permanent. */}
        {status === "building" && (
          <>
            {" "}
            · a site counts as building only while its build has been running for under{" "}
            <span className="k-num">{staleMinutes}</span> minutes, because a build that loses its
            connection leaves no cleanup behind.
          </>
        )}
      </p>

      <div className="mt-4">
        {visible.length === 0 ? (
          <EmptyState
            kind="no-results"
            icon={<Search className="size-7" aria-hidden />}
            title="No sites match that"
            body={
              status === "building"
                ? `Nothing is building right now. A site only counts as building while a build has been running for under ${staleMinutes} minutes.`
                : "Try a different search, or widen the status filter."
            }
            action={
              filtered ? (
                <Button variant="secondary" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : view === "grid" ? (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((site) => (
              <li key={site.id} className="flex">
                <WebsiteCard project={site} />
              </li>
            ))}
          </ul>
        ) : (
          <ul className="divide-y divide-hair overflow-hidden rounded-xl border border-hair bg-surface shadow-e1">
            {visible.map((site) => (
              <li key={site.id}>
                <WebsiteCard project={site} variant="list" />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
