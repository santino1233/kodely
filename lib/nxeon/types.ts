/**
 * The vocabulary of the Kodely ↔ Nxeon bridge.
 *
 * Everything here is DATA — no functions, no network, no environment reads —
 * so it can be imported from anywhere, including a browser bundle, without
 * dragging `node:dns` or an HTTP client along with it. The behaviour lives in
 * `client.ts` (the interface), `not-configured.ts` (the only implementation
 * today) and `state.ts` (the lifecycle).
 *
 * ## Two rules these types exist to enforce
 *
 * 1. **An observation is not a verdict.** Nothing in this file has a field
 *    called `propagated`, `verified: boolean` sitting on its own, or `ready`.
 *    DNS has no global state to report — see `DomainObservation` — and a type
 *    that offers a boolean for it invites every caller to render a sentence
 *    that is not true. Where a caller genuinely needs a yes/no it must derive
 *    one from a stated vantage point at a stated time, and say so on screen.
 *
 * 2. **Failures carry the provider's own words.** `AcmeFailure.type` is the
 *    verbatim ACME problem-document URN, `DomainRegistration.eppStatus` is the
 *    verbatim EPP status code list. Our classification sits NEXT to them
 *    (`AcmeFailure.kind`), never instead of them. When a customer's certificate
 *    will not issue, the difference between "your CAA record forbids it" and
 *    "we hit a rate limit" is the whole support ticket, and a lossy enum throws
 *    it away before anyone can read it.
 *
 * Anything marked UNSURE is a question for the Nxeon API owner. It is written
 * into the type rather than guessed, so a wrong assumption cannot hide inside a
 * plausible-looking field.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/**
 * A hostname in ASCII (A-label / punycode) form, lowercased, with no trailing
 * dot. Produced by `normalizeHostname()` in `./hostname` — nothing should put a
 * raw user string into a field typed as this without going through it first.
 *
 * Not a branded type on purpose. A brand would be enforced only at the call
 * sites that bother to cast, and this codebase's convention is a normalising
 * function at the boundary (see `bareHost()` in app/api/site/[slug]/site-host.ts)
 * rather than a type-level ceremony that a single `as` defeats.
 */
export type Hostname = string;

/**
 * Money in minor units, never a float. `{ amountMinor: 1299, currency: "USD" }`
 * is $12.99.
 *
 * `currency` is ISO 4217 and is deliberately a plain string: UNSURE which
 * currencies Nxeon settles in, and a union invented here would either be wrong
 * or would have to be widened the first time it met reality.
 */
export type Money = {
  amountMinor: number;
  /** ISO 4217, uppercase. */
  currency: string;
};

// ---------------------------------------------------------------------------
// Domain search and registration
// ---------------------------------------------------------------------------

export type DomainSearchRequest = {
  /** What the customer typed. May or may not contain a dot. */
  query: string;
  /** TLDs to suggest alongside an exact match. Empty means Nxeon's default set. */
  tlds?: string[];
  /** Upper bound on suggestions. Nxeon may return fewer. */
  limit?: number;
};

export type DomainSuggestion = {
  domain: Hostname;
  available: boolean;
  /**
   * Registry-designated premium. Premium names carry a one-off price that bears
   * no relation to the TLD's standard price AND, on many registries, a premium
   * RENEWAL price forever. Showing a premium name at the standard price is the
   * "displayed price != charged price" bug lib/stripe.ts already names as a
   * thing that happened on Nxeon's own checkout. Both prices below are separate
   * fields for exactly that reason.
   */
  premium: boolean;
  /** First-term price. Null when Nxeon declines to quote. */
  price: Money | null;
  /**
   * What it costs to keep, per term, after the first. MUST be shown next to
   * `price` in any UI. For most TLDs these are equal; for premiums, `.ai`, and
   * a handful of others they are not.
   */
  renewalPrice: Money | null;
  /**
   * Years the first-term price covers. Not always 1: some TLDs have a two-year
   * minimum registration period.
   */
  termYears: number;
};

export type DomainSearchResult = {
  /** The exact name the query resolves to, if it is registrable at all. */
  exact: DomainSuggestion | null;
  alternatives: DomainSuggestion[];
  searchedAt: Date;
};

/**
 * ICANN-mandated registrant contact data for a gTLD registration.
 *
 * This is real personal data about a real person, collected because a registry
 * requires it, and it is the reason a domain purchase is a heavier feature than
 * it looks. Consequences that must be designed for, not discovered:
 *
 *  - It has to be ACCURATE. A registrar that receives a bounce on the
 *    registrant email is obliged to act on it, and an unverified registration
 *    can be suspended.
 *  - Changing the registrant email can start a 60-day transfer lock.
 *  - It lands in two more published documents the moment Kodely stores it:
 *    /legal/rights and the data export both enumerate everything the database
 *    holds. Adding these fields makes both wrong until they are updated.
 *
 * Kodely's own preference is to store as little of this as possible and let
 * Nxeon hold the record — see the `registrantOnFileWith` question in the
 * research doc.
 */
export type RegistrantContact = {
  firstName: string;
  lastName: string;
  organization?: string;
  email: string;
  /** E.164, e.g. "+44.7700900123" — UNSURE which of the two common formats Nxeon wants. */
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  /** State/province. Required by some registries, absent in some countries. */
  state?: string;
  postalCode: string;
  /** ISO 3166-1 alpha-2, uppercase. */
  countryCode: string;
};

export type PurchaseDomainRequest = {
  domain: Hostname;
  termYears: number;
  registrant: RegistrantContact;
  /** WHOIS/RDAP privacy proxy, where the TLD permits one. */
  whoisPrivacy: boolean;
  autoRenew: boolean;
  /**
   * Kodely-generated, stored on the Domain row BEFORE the call, and reused
   * verbatim on every retry of the same purchase.
   *
   * A domain purchase is the one operation in this interface that spends real
   * money and cannot be undone: registrations are non-refundable at essentially
   * every registrar. A retry after a timeout — which is the normal shape of a
   * network failure, not an exotic one — must not be able to buy the name
   * twice, and the only thing that can prevent that is a key the SERVER
   * deduplicates on. Kodely cannot make this guarantee alone.
   */
  idempotencyKey: string;
  /** Kodely's `Domain.id`, so the two systems can be reconciled by hand. */
  externalId: string;
};

/**
 * Registry lifecycle, as a coarse enum for the UI. `eppStatus` on
 * `DomainRegistration` carries the real, exact story.
 */
export type RegistrarStatus =
  | "pending"
  | "active"
  /** Past expiry, inside the registrar's auto-renew grace. Still recoverable at list price. */
  | "grace"
  /** Deleted at the registry; recoverable only by paying a redemption fee. */
  | "redemption"
  /** Past redemption. Five days from being released to the public. Nothing can be done. */
  | "pending_delete"
  /** A transfer to another registrar is in flight or has completed. */
  | "transferred"
  | "failed";

export type DomainRegistration = {
  domain: Hostname;
  status: RegistrarStatus;
  /**
   * Verbatim EPP status codes: `clientTransferProhibited`, `clientHold`,
   * `serverHold`, `pendingTransfer`, `autoRenewPeriod`, `redemptionPeriod`, …
   *
   * Kept raw and complete because these are the codes support will be reading
   * back to a registrar. `clientHold` in particular is invisible in every other
   * field here and means the name has been REMOVED FROM DNS — the site is down
   * and no amount of DNS or certificate debugging will explain why.
   */
  eppStatus: string[];
  /** The accredited registrar of record, e.g. "Namecheap, Inc." Not "Nxeon". */
  registrar: string;
  /**
   * Whose name is on the registration. THE central question of §1 in the
   * research doc: if this is not the customer, they do not own their domain.
   */
  registrantEmail: string;
  createdAt: Date;
  expiresAt: Date;
  autoRenew: boolean;
  whoisPrivacy: boolean;
  /**
   * When the ICANN 60-day inter-registrar transfer lock lifts. Null means no
   * lock is in force. A customer who wants to leave before this date cannot,
   * and must be told the date rather than being told "no".
   */
  transferUnlocksAt: Date | null;
  nameservers: Hostname[];
};

export type TransferAuthorization = {
  domain: Hostname;
  /**
   * The EPP auth code ("authinfo", "transfer code", "EPP key"). This is the
   * bearer credential for moving a domain to another registrar.
   *
   * Handing it over is the act of letting a customer leave. It MUST be
   * available self-service: a builder that makes you email support to get your
   * own auth code is holding your domain hostage, whatever its terms say. It
   * must also never be logged, never be put in an email body, and never be
   * stored on the Domain row — fetch it on demand, show it once.
   */
  authCode: string;
  /** True while the registry refuses a transfer regardless of the code. */
  transferLocked: boolean;
  /** When the lock lifts. Null when `transferLocked` is false. */
  unlocksAt: Date | null;
};

// ---------------------------------------------------------------------------
// DNS
// ---------------------------------------------------------------------------

export type DnsRecordType = "A" | "AAAA" | "CNAME" | "TXT" | "MX" | "CAA" | "NS" | "ALIAS";

export type DnsRecord = {
  type: DnsRecordType;
  /**
   * Relative to the zone. `""` or `"@"` is the apex; `"www"` is www.<domain>.
   * Kodely always writes `"@"` for the apex so the two spellings never both
   * appear in one list.
   */
  name: string;
  value: string;
  ttlSeconds: number;
  /** MX only. */
  priority?: number;
};

export type DnsZone = {
  domain: Hostname;
  /** The NS records the registry is delegating to. */
  nameservers: Hostname[];
  records: DnsRecord[];
  updatedAt: Date;
};

/**
 * Where a customer must point their DNS. Fetched, never hardcoded.
 *
 * Hardcoding an IP address in Kodely means that the day Nxeon changes an edge
 * address, every customer's site breaks and the fix is a Kodely deploy. Worse,
 * customers who already copied the old value out of the UI have no reason to
 * come back and look at it again. This must come from the system that owns the
 * address.
 */
export type NxeonEdgeTargets = {
  /** A records for an apex that cannot hold a CNAME. At least one. */
  ipv4: string[];
  /** AAAA records. May be empty if Nxeon's edge is v4-only. */
  ipv6: string[];
  /**
   * CNAME target for `www`, and for an apex at a provider that offers
   * ALIAS/ANAME/flattening. Preferred wherever the customer's DNS host allows
   * it, because it survives an edge address change without the customer doing
   * anything.
   */
  cname: Hostname;
  /** TTL Nxeon recommends customers set. Advisory. */
  recommendedTtlSeconds: number;
};

// ---------------------------------------------------------------------------
// Observation
// ---------------------------------------------------------------------------

export type DnsLookupFailure =
  /** The name does not exist. */
  | "nxdomain"
  /** The name exists but has no record of the type asked for. */
  | "no_records"
  | "timeout"
  /** The nameserver answered with a failure. */
  | "servfail"
  /**
   * We refused to ask. The zone's nameservers resolved to an address we will
   * not send packets to — see the classification note in `dns.ts`.
   */
  | "refused_target"
  | "error";

export type DnsLookupOutcome =
  | { ok: true; values: string[] }
  | { ok: false; code: DnsLookupFailure; detail: string };

/**
 * Where an answer came from. Never optional, because a claim about DNS with no
 * vantage point attached is not a claim about anything.
 */
export type DnsVantage =
  /** Asked the zone's own authoritative nameservers. The earliest possible sighting. */
  | { kind: "authoritative"; nameservers: Hostname[]; addresses: string[] }
  /** Asked a recursive resolver. Subject to its cache, and therefore lagging. */
  | { kind: "recursive"; resolvers: string[] };

/**
 * One look at a domain's DNS, from one place, at one moment.
 *
 * Read the field names: `observedAt`, `vantage`. There is no `propagated`
 * field and there will not be one. "Propagation" is a word that describes
 * caches expiring at millions of independent resolvers on their own schedules;
 * no single query can observe it and no API can report it. The honest UI
 * sentence derived from this type is "we can see it" or "we can't see it yet
 * from here", never "your DNS has propagated".
 *
 * Seeing the record at the AUTHORITATIVE servers means the customer has done
 * their part — that is the useful, checkable fact, and it is the earliest one
 * available. Visitors may still be served a cached old answer for up to the
 * previous record's TTL, which is a separate sentence.
 */
export type DomainObservation = {
  domain: Hostname;
  observedAt: Date;
  vantage: DnsVantage;
  /** The `_kodely-verify.<domain>` TXT lookup. */
  txt: DnsLookupOutcome;
  /** A/AAAA (or CNAME, if the apex is CNAME'd) at the apex. */
  apex: DnsLookupOutcome;
  /** CNAME (or A) at `www`. */
  www: DnsLookupOutcome;
  /**
   * CAA at the apex. Empty means any CA may issue. A non-empty set that does
   * not name our ACME CA will make certificate issuance fail with an error that
   * looks like a Kodely bug and is not — so we look BEFORE ordering, and tell
   * the customer exactly which record to change.
   */
  caa: DnsLookupOutcome;
};

// ---------------------------------------------------------------------------
// Certificates
// ---------------------------------------------------------------------------

export type CertificateState =
  /** No certificate and none ordered. */
  | "none"
  /** An ACME order is in flight. */
  | "pending"
  | "issued"
  /** The last attempt failed. `failure` says why. A previously issued cert may still be installed and valid. */
  | "failed"
  | "revoked";

export type AcmeFailureKind =
  /** A CAA record on the customer's domain forbids our CA. Customer action required. */
  | "caa_forbids"
  /** The challenge could not be satisfied — usually DNS not pointing here yet. */
  | "dns_mismatch"
  /** The CA is throttling us. Ours to solve, never the customer's fault, and never their problem to fix. */
  | "rate_limited"
  /** The CA could not reach the validation target. */
  | "unreachable"
  | "unknown";

export type AcmeFailure = {
  /** Verbatim ACME problem document type, e.g. "urn:ietf:params:acme:error:caa". */
  type: string;
  /** Verbatim `detail` from the CA. Shown to support, not to the customer. */
  detail: string;
  /** Our classification of `type`, which is what picks the customer sentence. */
  kind: AcmeFailureKind;
  /** When a retry is permitted. Null when unknown. */
  retryAfter: Date | null;
};

export type CertificateStatus = {
  domain: Hostname;
  state: CertificateState;
  /** Of the INSTALLED certificate. Null when none is installed. */
  notBefore: Date | null;
  /**
   * Of the INSTALLED certificate — the date the site starts showing a browser
   * interstitial if renewal has not happened.
   *
   * This is the single most important field in the interface, and the reason
   * `certificateStatus` must be polled on a schedule rather than only read when
   * a customer opens the page. A renewal job that silently stops working
   * produces NO signal at all until this date arrives, at which point every
   * visitor sees a full-page security warning. Monitoring the renewal job is
   * not a substitute for monitoring this date: the job can report success and
   * still not have installed the result.
   */
  notAfter: Date | null;
  issuer: string | null;
  /** SANs actually present on the installed certificate — apex and www are separate names. */
  covers: Hostname[];
  failure: AcmeFailure | null;
  lastAttemptAt: Date | null;
  /** When Nxeon will try again by itself. Null when it will not. */
  nextAttemptAt: Date | null;
  /** When unattended renewal is scheduled to begin. */
  renewAfter: Date | null;
};

// ---------------------------------------------------------------------------
// Hosting: provision, deploy, remove
// ---------------------------------------------------------------------------

export type SiteState =
  | "provisioning"
  | "active"
  /** Deliberately not serving, but not deleted. See `suspendSite`. */
  | "suspended"
  | "failed"
  | "removing";

export type ProvisionSiteRequest = {
  /** Kodely's `Project.id`. */
  externalId: string;
  /** The `<slug>.kodely.site` name, so Nxeon can serve it too if the site moves wholesale. */
  slug: string;
  /** Every hostname this site answers on. Usually [apex, www]. */
  hostnames: Hostname[];
  idempotencyKey: string;
};

export type SiteProvision = {
  /** Nxeon's id. Stored on Kodely's Domain row; the join key for everything after. */
  siteId: string;
  state: SiteState;
  hostnames: Hostname[];
  /** Null until at least one deploy has gone live. */
  currentReleaseId: string | null;
  createdAt: Date;
};

/**
 * One file in a deploy.
 *
 * `body` is a string because that is what `ProjectFile.content` is — the whole
 * published tree is already text in Postgres. `encoding` exists so a future
 * binary asset (a favicon, a woff2) has somewhere to go without changing the
 * shape, and `sha256` is per file so a partial upload is detectable per file
 * rather than only in aggregate.
 */
export type DeployFile = {
  /** Relative to the document root. No leading slash, no `..`. */
  path: string;
  body: string;
  encoding: "utf8" | "base64";
  /** Lowercase hex SHA-256 of the DECODED bytes. */
  sha256: string;
};

export type DeployRequest = {
  siteId: string;
  /** Kodely-generated. The same id is the idempotency key and the release name. */
  deploymentId: string;
  files: DeployFile[];
  /**
   * SHA-256 over the sorted `path:sha256` lines of every file, so the receiver
   * can prove it got the whole set and not a truncated one. Computed by
   * `deployManifestSha256()` in `./manifest`.
   */
  manifestSha256: string;
};

export type DeploymentState =
  | "queued"
  | "uploading"
  /** Files landed; the manifest hash is being checked before the swap. */
  | "verifying"
  /** The atomic swap happened. This release is what visitors get. */
  | "live"
  | "failed"
  /** A later release was withdrawn and this one is serving again. */
  | "rolled_back";

export type Deployment = {
  id: string;
  siteId: string;
  state: DeploymentState;
  /** The release directory this deploy created. Pass to `rollbackSite` to return to it. */
  releaseId: string | null;
  /** What was serving before. Null on a site's first deploy. */
  previousReleaseId: string | null;
  fileCount: number;
  bytes: number;
  startedAt: Date;
  finishedAt: Date | null;
  /** Set when `state` is "failed". Operator-facing text. */
  error: string | null;
};

export type RemoveSiteRequest = {
  siteId: string;
  /**
   * Why. Recorded on Nxeon's side so a removal can be explained months later,
   * and so an abuse takedown is distinguishable from a customer deleting their
   * own project.
   */
  reason: "customer_deleted" | "domain_removed" | "abuse" | "billing_lapsed";
};

export type SuspendSiteRequest = {
  siteId: string;
  reason: "billing_lapsed" | "abuse" | "operator";
  /**
   * What a visitor sees while suspended.
   *
   * `"holding_page"` is the default and the only humane option for a billing
   * lapse: a plain page saying the site is temporarily unavailable, served with
   * HTTP 503 so search engines treat it as transient and do not deindex the
   * site. `"offline"` returns nothing at all and is for abuse takedowns.
   */
  mode: "holding_page" | "offline";
};

export type PurgeCacheRequest = {
  siteId: string;
  /**
   * Specific paths, or omitted for the whole site. A republish changes the HTML
   * but usually not the hashed assets, so a targeted purge of the HTML entry
   * points is both cheaper and less likely to cause a thundering herd than
   * flushing everything.
   */
  paths?: string[];
};

export type NxeonHealth = {
  ok: boolean;
  /** Nxeon's build identifier, for correlating a bad day with a deploy on their side. */
  version: string;
  checkedAt: Date;
};
