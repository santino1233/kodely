import {
  Blocks,
  CreditCard,
  Gauge,
  Globe,
  House,
  LayoutTemplate,
  LifeBuoy,
  Link2,
  Settings,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Marks the destination as not yet backed by anything real. The item still
      appears — hiding it would leave the customer hunting for a feature we
      have talked about — but it is visibly labelled and its page says plainly
      what does not exist yet. See the honesty note below. */
  soon?: boolean;
  /** Exact-match highlighting. Without it /dashboard would light up for every
      page beneath it. */
  exact?: boolean;
};

export type NavGroup = { title: string; items: NavItem[] };

/* HONESTY RULE FOR THIS FILE
   ─────────────────────────
   `soon` means the DESTINATION has nothing real behind it. It is not a
   roadmap badge and it is not decoration.

   Integrations carries it: there is no integrations model, route or field of
   any kind, so the page exists only to say so and to name what IS already
   connected to the account.

   Domains deliberately does NOT carry it, even though custom domains are not
   built. That page is genuinely useful today — every published project has a
   real working address at <slug>.kodely.site, and the page lists them with
   copy and open. Only the custom-domain SECTION of it is unavailable, and it
   says so in place. Flagging the whole destination `soon` would tell someone
   looking for their live URL not to bother going there.

   (This comment previously claimed both items carried `soon`, which
   contradicted the code below. The code was right.)

   Anything WITHOUT `soon` must be reachable and useful. Do not add an item
   here until that is true of it. */
export const NAV: NavGroup[] = [
  {
    title: "Workspace",
    items: [
      { href: "/dashboard", label: "Home", icon: House, exact: true },
      { href: "/dashboard/websites", label: "My Websites", icon: Globe },
      { href: "/dashboard/new", label: "Create Website", icon: Sparkles },
      { href: "/dashboard/templates", label: "Templates", icon: LayoutTemplate },
    ],
  },
  {
    title: "Manage",
    items: [
      { href: "/dashboard/usage", label: "Usage", icon: Gauge },
      { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
      { href: "/dashboard/domains", label: "Domains", icon: Link2 },
      { href: "/dashboard/integrations", label: "Integrations", icon: Blocks, soon: true },
    ],
  },
  {
    title: "Support",
    items: [{ href: "/support", label: "Support", icon: LifeBuoy }],
  },
  {
    title: "Account",
    items: [{ href: "/settings", label: "Settings", icon: Settings }],
  },
];

/** Shared by the sidebar and the mobile drawer so the two can never disagree
    about which item is current. */
export function isActive(item: NavItem, pathname: string): boolean {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

/** The four items that reach the mobile bottom bar. Chosen by frequency, not
    by nav order: on a phone the bar is the whole navigation for the tasks
    people actually do one-handed, and everything else lives in the drawer. */
export const MOBILE_BAR: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: House, exact: true },
  { href: "/dashboard/websites", label: "Sites", icon: Globe },
  { href: "/dashboard/new", label: "Create", icon: Sparkles },
  { href: "/dashboard/usage", label: "Usage", icon: Gauge },
];
