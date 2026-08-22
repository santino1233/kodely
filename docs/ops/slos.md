# Service objectives — proposed

This document is mostly refusals, and that is the point of it.

An SLO is a promise plus a measurement. Kodely has no uptime monitoring, no
alerting and no on-call rotation, so for almost everything a status page would
normally commit to, the measurement half does not exist. **An SLO nobody
measures is a wish.** Publishing "99.9% uptime" against nothing would not be
optimistic, it would be false — and it would be falsifiable by the first
customer who happened to be looking during an outage.

So this document does three things: states the numbers that are genuinely
measured today and how thin they are, proposes the few objectives that can be
defended, and declines the rest by name with what it would take to un-decline
them.

---

## 1. What is actually measured today

Every figure here comes from the `Build` table via `/admin/health`, on the
**development** database. None of it is production data, and the sample sizes
are small enough that the sample size matters more than the figure.

| Figure | Value | Sample | Source |
| --- | --- | --- | --- |
| Green build first try | 100% | **5 successes** | `Build.repairAttempts = 0` over successes |
| Build duration, p50, successes | 167.8s | **5** | `endedAt − createdAt` |
| Build duration, p50, failures | 3.2s | small | same |
| Share of failures from one incident | 75% | — | SDK-auth family, `/admin/health` |
| Vite step timeout | 60s | n/a | constant in `lib/build-site.ts` |

Four things to hold onto:

- **Five is not a sample.** At n=5, a single additional failure takes a 100%
  rate to 83%. No percentage computed over five events can support a
  three-nines claim, or a two-nines one.
- **The 3.2s failure p50 is a diagnosis, not a performance figure.** Failures
  returning fifty times faster than successes means those runs never reached
  the model — they failed at configuration. Most of what looks like "build
  reliability" data so far is actually one auth outage.
- **75% of failures were one incident.** Any reliability rate computed across
  that window is a measurement of one afternoon's misconfiguration, not of the
  system's steady-state behaviour.
- **The 60s timeout is not the build budget.** It bounds only the `vite build`
  step inside a generation. The 167.8s p50 covers the whole generation, so the
  two numbers are not comparable and 60s must not be quoted as a latency
  target.

### What is not measured at all

No availability data exists for any component. Nothing has ever recorded
whether `kodely.me` was reachable, whether a published `*.kodely.site` page
answered, or how long any outage lasted. There is no time-to-detect and no
time-to-recover figure, because there is no record of a detection.

---

## 2. Structural limits any objective has to respect

These are properties of the deployment, not gaps to be closed with a
measurement:

- **One VM, one process, no redundancy.** There is no second instance to serve
  traffic while the first is unavailable.
- **Deploys take the service down.** `deploy.sh` runs `npm run build` on the
  box and then `systemctl restart`; it sleeps 5 seconds before verifying. Every
  routine deploy is therefore a short, deliberate outage of unmeasured length.
  Any availability target has to either exclude a declared maintenance window
  or be low enough to absorb deploys.
- **Generation depends on a credential that expires.** The engine currently
  runs on a subscription token, and "Not logged in" is an observed outage mode,
  not a theoretical one. Nothing renews it and nothing warns before it lapses.
- **The database is a single point of failure for everything**, including
  serving already-published sites, which read their content from it.

---

## 3. Proposed objectives

Each is written as an SLI (what is measured), a target, and — the part that
decides whether it is real — whether the measurement exists today.

### 3.1 Generation success rate · **provisional internal target**

- **SLI.** Of builds that reached a terminal state in a rolling 7-day window,
  the share with `status = SUCCEEDED`.
- **Target.** ≥ 90%, evaluated only in windows containing at least 100
  terminal builds.
- **Measurable today?** The numerator and denominator, yes — `/admin/health`
  computes exactly this. The 100-build qualifying threshold is not met, so the
  objective is currently *unevaluated*, not *met*.
- **Where 90% comes from.** It is chosen, not derived. It is the same
  threshold the public status page uses to call generation operational, and
  the two are deliberately the same number so the page and this document
  cannot disagree. There is no measurement behind it yet.
- **Not a customer commitment.** Say so anywhere it is quoted.

### 3.2 No build stays stuck · **committable**

- **SLI.** Count of builds in a non-terminal state for more than 15 minutes.
- **Target.** Zero, checked whenever `/admin/health` is opened.
- **Measurable today?** Yes — this is the "Stuck builds" tile, computed over
  all time, and it needs nothing new. This is the only objective in this
  document that is fully measured today.
- **Honesty caveat.** Measured is not enforced. Nothing detects a stuck build
  automatically and nothing reaps one; a person has to look. The target is
  meaningful as a checklist item, not as a guarantee.

### 3.3 Generation latency · **observation only, no target**

- **What is known.** p50 167.8s over 5 successes.
- **Proposed for now.** Record it, do not commit to it. A p50 over five
  samples is a description of five builds.
- **Explicitly refused: a p95.** A 95th-percentile figure over five samples is
  arithmetic performed on nothing. No p95 should be quoted anywhere — in this
  document, on the status page, or to a customer — until there are at least
  100 successful builds in the window.
- **What to do instead.** Watch p50 for a month with the timing panel that
  already exists, then propose a target. A plausible first target is "p50
  under 5 minutes", which the current figure clears comfortably, but proposing
  it now would be pretending five builds justified it.

### 3.4 Green build first try · **no target yet**

- **SLI.** Share of successful builds with `repairAttempts = 0`.
- **Measured.** 100% on 5 successes.
- **Why no target.** This is the metric most at risk of being turned into a
  slogan. 100% of five is compatible with a true rate anywhere from roughly
  50% upward. Re-propose after 30 days with at least 100 successes.

### 3.5 Time to take down a reported site · **declined, with a fix**

- **Why declined.** `AdminAuditLog` records when a takedown happened, but
  nothing records when the report *arrived*, so the interval that matters
  cannot be computed even retrospectively.
- **What would fix it.** Record a received-at timestamp for each abuse report
  in the same place the takedown is recorded. Then a target — "confirmed
  phishing offline within 4 hours of report" — becomes measurable, and the
  cache caveat (`Cache-Control: public, max-age=60`, nothing purges) becomes
  the honest floor on how fast "offline" can mean anything.

---

## 4. Declined outright

| Objective | Why it cannot be stated |
| --- | --- |
| App availability (any nines) | Nothing has ever measured reachability. There is no data, not even a bad estimate. |
| Published-site availability | Same, plus DNS/TLS/CDN are entirely outside anything this codebase observes. |
| Time to detect | There is no detection mechanism to time. Detection today is a customer email. |
| Time to recover | No incident has a recorded start or end. |
| API/endpoint latency | Nothing records request durations. The only timings in the database are build durations. |
| Email delivery | No delivery/bounce signal is recorded anywhere. |
| Payment webhook success rate | Stripe knows; this application does not aggregate it. |

Every row is declined for the same reason, stated once: **there is no
instrument.** None of them is declined because the underlying performance is
believed to be bad.

---

## 5. What must exist before any of this is a commitment

In order, because each step makes the next one worth doing:

1. **External reachability checks** for `kodely.me` and one canary
   `*.kodely.site` host, run from outside the VM, recording results
   durably. Without this there is no availability data and §4 stays declined
   forever.
2. **A generation canary** on a schedule — one real build whose outcome is
   recorded. It exercises SDK auth, the foundation tree and the compile path
   in one shot: the top two failure families and the compile path they hide.
3. **A place for an alert to arrive**, and a person expected to read it.
   Until then, "detected" means "somebody happened to open `/admin/health`".
4. **Retention of the measurements themselves.** Today the status page
   computes state at page load and stores nothing, so an SLO evaluated over a
   month has nothing to be evaluated against.
5. **Volume.** Several of the objectives above are unevaluable simply because
   the qualifying sample has not happened yet. That is not a defect; it is a
   young product, and the correct response is to say the window did not
   qualify rather than to compute a percentage over five rows.

## 6. Error budgets

Not proposed. An error budget is a spending account denominated in an
availability measurement; with no measurement there is no account, and a
budget invented on top of nothing would create the strongest false impression
in this entire document.

---

## 7. The numbers that *are* enforced today

For contrast, and so this document is not read as "nothing is guaranteed":
the data-retention figures in `docs/retention.md` are enforced by code in
`lib/retention.ts` rather than by intention — expired sessions deleted
immediately, snapshots kept to the newest 20 per project with a 30-day floor,
analytics events 400 days, Stripe receipts 365 days, credit ledger never
pruned. They are commitments in the sense this document is careful about.

The one honest caveat: **nothing schedules that job.** It is dry-run by
default and requires `--apply`, and `deploy.sh` installs no timer. The numbers
are enforced by the code the moment the job runs; until it is scheduled, the
policy is enforceable rather than enforced. See §4 of `docs/retention.md` for
the cron entry that closes this.
