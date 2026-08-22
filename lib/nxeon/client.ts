import type {
  CertificateStatus,
  DeployRequest,
  Deployment,
  DnsRecord,
  DnsZone,
  DomainObservation,
  DomainRegistration,
  DomainSearchRequest,
  DomainSearchResult,
  Hostname,
  NxeonEdgeTargets,
  NxeonHealth,
  ProvisionSiteRequest,
  PurchaseDomainRequest,
  PurgeCacheRequest,
  RemoveSiteRequest,
  SiteProvision,
  SuspendSiteRequest,
  TransferAuthorization,
} from "./types";

/**
 * The complete surface Kodely needs from Nxeon. Nothing else may talk to Nxeon.
 *
 * ## Why an interface at all
 *
 * There is exactly one implementation today (`not-configured.ts`) and it
 * throws. That is not a placeholder for its own sake — it is the shape that
 * makes the real client a ONE-FILE change: write `lib/nxeon/http.ts`
 * implementing this interface, and change the single `return` in
 * `lib/nxeon/index.ts`. No route, no component and no state machine has to
 * move, because none of them ever sees a URL, a header, or a fetch.
 *
 * ## Contract every method is written against
 *
 * 1. **Every method is async and every method can fail.** There is no
 *    "probably fine" call here; a registrar, a CA and a fleet of web servers
 *    are three separate things that can each be down.
 *
 * 2. **Mutating calls take an idempotency key, and it is the CALLER's.** Kodely
 *    generates the key, writes it to the database in the same transaction that
 *    creates the intent, and then calls. A retry after a timeout reuses the
 *    stored key. This is the only way a domain purchase or a deploy is safe to
 *    retry, and it is the pattern Stripe made standard — see the note on
 *    `PurchaseDomainRequest.idempotencyKey`.
 *
 * 3. **Read methods return OBSERVATIONS with timestamps, not verdicts.**
 *    `checkDomainRecords` does not return "verified: true". It returns what
 *    answered, from where, when. Deciding whether that is good enough is
 *    Kodely's job and it is done in `state.ts`, in the open, where the sentence
 *    shown to the customer can be traced to the fact that produced it.
 *
 * 4. **Nothing here writes to Kodely's database.** These are transport calls.
 *    Persisting the result — including the "we asked and it failed" result — is
 *    the caller's job, because a failure nobody wrote down is a failure nobody
 *    can retry or explain.
 *
 * 5. **Nothing here is a security boundary on its own.** In particular,
 *    `checkDomainRecords` returning the right TXT value is EVIDENCE of control,
 *    not proof of it, and it is only meaningful because the token it is
 *    checking for is unguessable and single-use. See `verification.ts`.
 *
 * ## What is deliberately absent
 *
 * - No `listDomains` / `listSites`. Kodely's database is the source of truth
 *   for what Kodely believes exists; a reconciliation job that walks Kodely's
 *   rows and asks about each one is auditable, and a bulk list that silently
 *   disagrees with our rows is a bug generator. If reconciliation at scale
 *   turns out to need it, add it then, with a cursor.
 * - No raw "call the registrar for me" escape hatch. The moment one exists,
 *   half the integration goes through it untyped and this interface stops
 *   describing what Kodely actually does.
 * - No method that returns a customer-facing string. Copy lives in `state.ts`,
 *   in one place, in Kodely's voice.
 */
export interface NxeonClient {
  // ── Health ───────────────────────────────────────────────────────────────

  /**
   * Is the bridge up, and which build is on the other end?
   *
   * Called by the admin panel and by any preflight that is about to do
   * something expensive. Distinguishing "Nxeon is down" from "this one domain
   * is broken" is the difference between an incident and a support ticket.
   */
  ping(): Promise<NxeonHealth>;

  /**
   * The DNS values customers must point at. Fetched, never hardcoded — see the
   * note on `NxeonEdgeTargets`.
   *
   * Expected to be cached by the caller for minutes, not milliseconds, and to
   * be re-read before showing a customer instructions. It must NOT be cached
   * across a deploy in a module-level constant, because that is a hardcode with
   * extra steps.
   */
  edgeTargets(): Promise<NxeonEdgeTargets>;

  // ── Registration: Kodely sells the customer a domain ──────────────────────

  /**
   * Availability and pricing for a name the customer typed.
   *
   * Read-only and cheap enough to run on keystroke-with-debounce. The result
   * carries `searchedAt` because availability is a racing fact: a name that was
   * free 40 seconds ago may not be, and `purchaseDomain` is the only thing that
   * settles it.
   */
  searchDomains(req: DomainSearchRequest): Promise<DomainSearchResult>;

  /**
   * Register a domain. **Spends real money and cannot be undone.**
   *
   * Domain registrations are non-refundable at essentially every registrar, and
   * a registry will not un-register a name because a customer changed their
   * mind. Everything about the call site follows from that:
   *
   *  - The `Domain` row and its `idempotencyKey` are written FIRST, in their
   *    own transaction, in state `purchase_pending`. If the process dies
   *    mid-call there is a row saying a purchase may be in flight, and
   *    `getRegistration` can settle it.
   *  - A timeout is NOT a failure. It is an unknown, and the only correct
   *    response is to retry with the same key or to ask `getRegistration`.
   *    Treating it as a failure and refunding the customer is how you pay for
   *    the same domain twice.
   *  - The customer must have seen and accepted the renewal price, not just the
   *    first-term price, before this is called.
   *
   * @throws if the name became unavailable, if the registrant data is rejected
   *   by the registry, or if payment on Nxeon's side fails. All three are
   *   distinguishable states the customer must be told about differently.
   */
  purchaseDomain(req: PurchaseDomainRequest): Promise<DomainRegistration>;

  /**
   * The registry's current view of a domain Nxeon registered for us.
   *
   * Returns null when Nxeon has no registration for the name — which includes
   * the case where the customer transferred it away, so a null here on a domain
   * we believe we hold is a real event, not a lookup miss to swallow.
   *
   * Polled on a schedule, not only on page load. `expiresAt` and `eppStatus`
   * are how expiry and `clientHold` are noticed before a customer notices.
   */
  getRegistration(domain: Hostname): Promise<DomainRegistration | null>;

  /**
   * Turn auto-renew on or off.
   *
   * Off is a legitimate customer choice and must be offered, but it is also the
   * single fastest way for someone to lose a domain by accident, so the UI that
   * calls this owes the customer the expiry date and a plain sentence about
   * what happens after it.
   */
  setAutoRenew(domain: Hostname, autoRenew: boolean): Promise<DomainRegistration>;

  /**
   * Fetch the EPP auth code so the customer can move their domain elsewhere.
   *
   * This is the exit door and it must stay unlocked. See the note on
   * `TransferAuthorization.authCode`: the code is a bearer credential, so it is
   * fetched on demand, shown once, never stored on our side, and never logged.
   *
   * Calling this is also a strong churn signal and it is tempting to gate it
   * behind a retention flow. Do not. A builder that makes leaving hard is a
   * builder nobody recommends.
   */
  requestTransferAuthCode(domain: Hostname): Promise<TransferAuthorization>;

  // ── DNS: only for zones Nxeon hosts ──────────────────────────────────────

  /**
   * The zone as Nxeon holds it. Null when Nxeon does not host DNS for this name
   * — which is the normal case for a domain the customer brought and kept at
   * their own provider.
   */
  getZone(domain: Hostname): Promise<DnsZone | null>;

  /**
   * Upsert records in a zone Nxeon hosts.
   *
   * Upsert by (type, name), NOT a whole-zone replace. A whole-zone write is how
   * a website builder deletes a customer's MX records and takes their email
   * down — the most common catastrophic support incident in this category, and
   * one that is entirely preventable at the type level by never having an API
   * that can express it.
   *
   * @throws if the zone is not hosted by Nxeon.
   */
  putRecords(domain: Hostname, records: DnsRecord[]): Promise<DnsZone>;

  // ── Verification and observation ─────────────────────────────────────────

  /**
   * Look at a domain's live DNS from Nxeon's vantage point.
   *
   * Kodely can and does do this itself (`observeDomain()` in `./dns`), and
   * having both matters: Kodely's app server and Nxeon's edge are in different
   * places on the network, and a record visible from one and not the other is
   * real information — usually a split-horizon or geo-DNS setup, occasionally a
   * customer who edited the wrong zone. Two vantage points that agree is a much
   * stronger statement than one that is confident.
   *
   * Returns an observation. It does not decide anything.
   */
  checkDomainRecords(domain: Hostname, expectedTxt: string): Promise<DomainObservation>;

  // ── Certificates ─────────────────────────────────────────────────────────

  /**
   * Ask Nxeon to obtain a certificate covering this domain's hostnames.
   *
   * Idempotent by domain: calling it while an order is in flight must return
   * the in-flight status rather than starting a second order. This is not a
   * nicety. ACME CAs rate-limit hard on both orders and failed validations, and
   * a retry loop that starts a fresh order every time is how one impatient
   * customer exhausts a limit that is shared across every customer on the
   * platform.
   *
   * Kodely calls this only after `checkDomainRecords` shows the traffic records
   * pointing at Nxeon AND shows CAA permitting our CA. Ordering before that is
   * ordering a failure, and failed validations count against a limit too.
   */
  requestCertificate(domain: Hostname): Promise<CertificateStatus>;

  /**
   * Current certificate state, including the installed certificate's expiry.
   *
   * The `notAfter` field is the one that must be polled independently of
   * everything else — see its note in `types.ts`. A renewal pipeline reporting
   * success is not evidence that a valid certificate is installed; only the
   * installed certificate's dates are.
   */
  certificateStatus(domain: Hostname): Promise<CertificateStatus>;

  // ── Hosting ──────────────────────────────────────────────────────────────

  /**
   * Create the server-side site: vhost, document root, hostname bindings.
   *
   * Separate from `deploySite` on purpose. Provisioning is slow, involves
   * configuration that can conflict with another tenant's, and needs to have
   * happened before a certificate order makes sense. Deploying is fast, happens
   * on every republish forever, and must not be able to fail for a
   * configuration reason.
   *
   * **The hostname uniqueness question belongs here.** Hostnames are globally
   * unique and Nxeon serves more than Kodely. Nxeon MUST refuse to bind a
   * hostname that another Nxeon site already holds, and MUST tell us that is
   * why. If it silently rebinds, then whoever provisions last serves the
   * domain — and that is a cross-tenant takeover with a friendly API.
   */
  provisionSite(req: ProvisionSiteRequest): Promise<SiteProvision>;

  /**
   * Push a complete published file tree and make it live atomically.
   *
   * "Complete", not a diff: the request carries every file the site should
   * serve. Kodely's published tree is already a whole-tree snapshot in Postgres
   * (the publish route deletes and recreates it), sites are small, and a
   * whole-tree deploy has no state to get wrong. A diff-based deploy would have
   * to reason about what the server currently holds, which is the thing that
   * drifts.
   *
   * "Atomically" means visitors see the old tree or the new tree and never a
   * half-written one. The standard implementation is write to a new release
   * directory, fsync, then swap a symlink with `rename(2)`.
   *
   * Returns as soon as the deploy is ACCEPTED. `getDeployment` polls it to
   * `live` or `failed`.
   */
  deploySite(req: DeployRequest): Promise<Deployment>;

  /** Poll a deploy to completion. */
  getDeployment(siteId: string, deploymentId: string): Promise<Deployment>;

  /**
   * Return a site to a previous release.
   *
   * Cheap and instant if releases are directories and `current` is a symlink,
   * which is why that shape is worth insisting on. This is the answer to "the
   * agent regenerated my site and it's worse", and it is a much better answer
   * than "republish and hope".
   */
  rollbackSite(siteId: string, releaseId: string): Promise<Deployment>;

  /**
   * Drop cached copies at Nxeon's edge.
   *
   * Called after a deploy goes live. Without it, a republish appears to do
   * nothing for however long the edge cache holds the old HTML, and the
   * customer republishes again, and again.
   */
  purgeCache(req: PurgeCacheRequest): Promise<void>;

  /**
   * Stop serving without deleting anything.
   *
   * The honest response to a lapsed payment. `mode: "holding_page"` returns a
   * 503 with a plain page, which is transient in every crawler's model and
   * therefore does not cost the customer their search rankings while they sort
   * out a card. Deleting a site over a failed payment is not a billing policy,
   * it is data loss with an invoice attached.
   */
  suspendSite(req: SuspendSiteRequest): Promise<SiteProvision>;

  /** Undo `suspendSite`. Must restore the same release, not require a redeploy. */
  resumeSite(siteId: string): Promise<SiteProvision>;

  /**
   * Delete the site, its releases and its hostname bindings.
   *
   * Irreversible on Nxeon's side. The binding release is the part that matters
   * for correctness: until the hostname is unbound, nobody else — including the
   * customer, moving to another host — can be bound to it.
   */
  removeSite(req: RemoveSiteRequest): Promise<void>;
}
