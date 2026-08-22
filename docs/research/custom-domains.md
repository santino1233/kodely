# Custom domains: how the competition actually does it

Research gathered 2026-08-22. The Nxeon integration work this was commissioned for
was stopped by the owner; this document is kept because the findings apply to any
custom-domain implementation, whoever hosts it.

**Verification status:** every claim here was read off a vendor doc unless marked
*secondary*. Webflow's help centre returns 403 to automated fetching, so its record
values are secondary and must be re-checked by a human against Site settings →
Publishing. Items marked UNSURE are genuinely unverified, not guessed.

---

## The single most important finding

**Webflow and Lovable — our two nearest comparables — have both bought their way
out of the DNS-instructions problem, using [Entri](https://www.entri.com/products/connect).**

Entri detects the customer's DNS provider, the customer logs into their registrar
inside a whitelabelled modal, and Entri *writes the records for them*. Entri
publishes Webflow-attributed outcomes: **2× domain-connect rate, ~30% faster
time-to-connect, 97% fewer DNS support tickets**, and an overall connection-success
move from **20% → 80%**. Vendor-published, so discount accordingly — but the
direction is unambiguous, and it says something uncomfortable:

> What moves the number is **automating the record write**, not explaining the
> records better.

Every hour spent making our DNS instructions clearer is competing against a product
that removed the instructions.

- The open, MIT-licensed standard underneath is **[Domain Connect](https://www.domainconnect.org/)**
  (originated at GoDaddy, submitted to the IETF). Implementing it directly is free.
- Entri pricing: **$249/mo** Startup (600 domains/yr, 1,200 monitored), Growth 2,400/yr,
  Premium 12,000/yr. No free tier.
- Entri covers **70+ providers** by API and degrades to registrar-specific
  step-by-step instructions rather than failing.

---

## Two constraints any design must respect

**1. The apex cannot be a CNAME.** RFC 1034 forbids other data alongside a CNAME,
and the apex must carry SOA/NS records (and usually MX). So the apex needs A records,
or a provider-specific ALIAS/ANAME/CNAME-flattening answer.

Netlify and Cloudflare handle this properly. Most builders just hand out a raw IP —
which has a nasty property Approximated states plainly: **if you publish a raw IP for
apex A records, changing that IP means every customer must edit their DNS
individually.** An intermediary hostname or an ALIAS-capable answer avoids that.

Netlify's is the best-shaped answer in the set:

| Case | Type | Value |
|---|---|---|
| Apex, provider supports it (**recommended**) | ALIAS / ANAME / flattened CNAME | `apex-loadbalancer.netlify.com` |
| Apex, fallback | A | `75.2.60.5` |
| Subdomain | CNAME | `<site>.netlify.app` |

**2. Let's Encrypt rate limits** ([official](https://letsencrypt.org/docs/rate-limits/)):
50 certs per registered domain / 7 days · 5 duplicate certs / 7 days · 300 new orders
per account / 3 hours · **5 failed validations per identifier / hour**.

Let's Encrypt explicitly recommends large integrators use **one account across many
customers**, with an override request form that takes weeks. Heroku's practical
corollary: repeatedly toggling certificate management off and on gets you rate-limited,
and support cannot bypass it.

---

## What each vendor makes the customer do

| Vendor | Apex | `www` | Extra | Records to get right |
|---|---|---|---|---|
| **Wix** | A → `185.230.63.107` | CNAME → `pointing.wixdns.net` | — | 2 |
| **Squarespace** | 4 × A | CNAME → `ext-cust.squarespace.com` | + verification CNAME with a **random per-site host label** | **6** |
| **Webflow** *(secondary)* | A → `75.2.70.75`, `99.83.190.102` | CNAME → `proxy-ssl.webflow.com` | Or Entri quick-connect | 3 |
| **Vercel** | A (value shown per project) | **per-project** CNAME e.g. `d1d4fc829fe7bc7c.vercel-dns-017.com` | `_vercel` TXT only if contested | 2 |
| **Netlify** | ALIAS (preferred) or A | CNAME → `<site>.netlify.app` | — | 2 |
| **Framer** | A → `31.43.160.6`, `31.43.161.6` | CNAME → `sites.framer.app` | — | 3 |
| **Lovable** | A → `185.158.133.1` | **not auto-included** | `_lovable` TXT | 2–3 |
| **Shopify** | A → `23.227.38.65` + AAAA | CNAME → `shops.myshopify.com.` (trailing dot) | — | 3 |
| **Cloudflare for SaaS** | — | **one CNAME, that's all** | — | **1** |

Two things fall out of that table. Squarespace's six records — one carrying a random
string into a host field that many registrar UIs mangle — is the worst case, and
Cloudflare for SaaS's single CNAME is the target to aim at.

Also note **Vercel's CNAME is now per-project** (`d1d4…vercel-dns-017.com`), not the
old shared `cname.vercel-dns.com`, and **Wix's records are no longer** the
`23.236.62.147` pair that most third-party tutorials still publish. Stale record
values circulating on the web are themselves a failure mode.

---

## Cloudflare for SaaS is the reference implementation

The customer makes **exactly one CNAME**, to a published target. No IPs, no per-tenant
values. Validation via TXT, HTTP-automatic, or **Delegated DCV** — the customer
delegates `_acme-challenge` once and every future renewal is hands-off.

Its state model is the key design insight: **two independent axes.**

- `status`: `pending` → `active` / `active re-deploying` / `blocked` (abuse) /
  `moved` (no longer pointing at the fallback origin) / `deleted` (7+ days in `moved`)
- `ssl.status`: tracks issuance and deployment **separately**

Production-ready = `status: active` **and** `ssl.status: active`. Most builder UIs
collapse those into one spinner, which makes "DNS is right but the certificate isn't
ready yet" unrepresentable — and that is the single most common real state.

**Pricing: 100 custom hostnames free on Free/Pro/Business, then $0.10 per hostname
per month** up to 50,000. Compare Approximated at **$0.20/domain/month** with a
$20/mo floor.

---

## Honest status copy is an unoccupied competitive position

Every vendor here says "24–48 hours to propagate". Lovable says 72. **Even Vercel,
which publishes the correct mitigation, still ships the 48-hour line in its own docs.**

That number is largely folklore. [Julia Evans, *DNS "propagation" is actually caches
expiring*](https://jvns.ca/blog/2021/12/06/dns-doesn-t-propagate/) is the best source:
DNS is **pull, not push** — nothing propagates, you are waiting for cached records to
expire. **A brand-new record is available immediately.** The delay only exists when
you are *replacing* something already cached.

Two gotchas that matter enormously for a builder product:

- **Negative caching.** If the customer (or our own checker) queries a record *before
  it exists*, the absence is cached — governed by the SOA MINIMUM, often an hour. So
  "I checked and it didn't work" is a self-inflicted wound we should warn about
  *before* they check.
- **Nameserver changes really are the slow case**, because both the registry update
  and the cached NS records (typically 1-day TTL) must clear.

Do not overcorrect: [Let's Encrypt staff push back](https://community.letsencrypt.org/t/dont-say-propagation-in-dns/171127)
that there *is* real propagation inside a DNS provider's own infrastructure, on the
order of seconds to minutes. The honest line is: **a short real delay at your DNS
provider, then cache expiry governed by your old record's TTL.**

**Vercel is the only mainstream vendor publishing the actually-correct advice:**
lower the TTL to ~60s *before* the cutover, raise it after.

### The copy pattern to adopt

1. Name the **specific check** that has not passed, not the phase. "We can't see the
   A record for `example.com` yet" beats "Pending DNS".
2. **Show observed vs expected.** "We see `76.76.21.21`; we expect `185.x.x.x`."
   That turns a mystery into a diff a non-technical person can act on.
3. Anchor the ETA on the **TTL actually read from their current record**, not on
   folklore. "Your DNS provider is caching the old value for 1 hour" is checkable.
4. Distinguish **still-retrying** from **stopped**. Heroku's `Failing` (couldn't
   verify, still retrying up to an hour) vs `Failed` (stopped trying) is the
   highest-value single distinction in this whole problem space.
5. Never conflate DNS-correct with certificate-issued with live-everywhere. Shopify
   defines "connected" as a **three-part conjunction** — DNS points at us **and** the
   domain is live in all regions **and** the TLS certificate is provisioned. That is
   the right bar for a green tick.
6. **Warn about negative caching before they trip it.**

### Model states as diagnoses, not progress

Approximated's enum is worth stealing wholesale, because each value maps to a
*different customer instruction*:

- `ACTIVE_SSL` — done
- `DNS_INCORRECT` — resolving, but pointed somewhere else
- `DNS_NOT_RESOLVING` — no records at all
- `TARGET_NOT_LOADING` — reaching us, origin dead

Lovable's five-step ladder (**Unpublished → Ready → Verifying → Setting up → Live**)
is the closest published progress model, and Vercel's block **re-checks every 20
seconds** rather than making the customer hit refresh.

---

## Failure modes to design against

Each of these recurs across every vendor's forums:

- **"Not secure" browser warning** — from a half-completed record set, or DNS
  resolving before the certificate is issued. The customer sees a security
  interstitial *on their own brand*. Highest-severity outcome in the system, and it
  is reachable by doing 50% of the instructions correctly.
- **`DNS_PROBE_FINISHED_NXDOMAIN` after a correct setup** — negative caching, or a
  local OS/browser cache. Mitigation: tell them not to check yet, and give them a
  "check from our servers" button so they are not diagnosing from their own poisoned
  cache.
- **Cloudflare orange-cloud proxy in front of us** with SSL mode **Flexible** plus an
  origin that redirects HTTP→HTTPS → `ERR_TOO_MANY_REDIRECTS`. Detect proxied
  Cloudflare records and warn.
- **Both A records and nameservers set.** Nameservers win; the A records become dead
  config the customer keeps re-checking. If we offer both paths, detect and state
  which one is actually in force.
- **CAA records blocking Let's Encrypt** (need `0 issue "letsencrypt.org"`) and
  **stale `_acme-challenge` TXT** from a previous host. Both silently prevent
  issuance with no DNS-level symptom. Check for both automatically.
- **Conflicting pre-existing A/AAAA records.** Non-technical customers *add* rather
  than replace. Framer and Shopify both warn about this explicitly.
- **60-day ICANN transfer lock** after registration — surfaces as "why can't I move
  my domain" immediately after they buy one from us.
- **Registrar UIs mangling the host field** — the biggest cause of failed TXT and
  verification-CNAME entries. Providers variously want `_lovable`,
  `_lovable.example.com`, or `@`; trailing dots are required by some (Shopify,
  Vercel) and rejected by others.

---

## Economics, if we ever resell domains

Verisign wholesale .com is **$10.26**, rising **7% to $10.97 on 1 Nov 2026**, with up
to three further 7% rises permitted this contract cycle
([Domain Name Wire](https://domainnamewire.com/2026/04/23/breaking-verisign-raising-wholesale-com-prices/)).
Plus the $0.18 ICANN fee: at-cost is ~$10.44 today, ~$11.15 from November.

**A free-first-year offer therefore costs ~$10–11 per activated customer.** The market
has bifurcated:

- **Wix / Squarespace / Framer** — year one free, recoup at **$20–21** renewals.
- **Cloudflare / Vercel** — sell **at cost**, compete on the absence of a year-two
  surprise. Cloudflare .com ≈ **$10.44**, registration price = renewal price.

Also worth noting: **Lovable lets already-connected domains keep serving after a
downgrade to Free** (you just cannot add or buy new ones). That is a customer-friendly
choice worth matching — the alternative is taking someone's live site down over a
billing lapse.

---

## Unresolved

Registrar of record for Wix / Vercel / Netlify / Shopify's partner · Netlify and
Framer domain prices · whether Webflow resells domains at all · non-payment and
grace-period behaviour for Wix, Squarespace, Webflow, Shopify, Netlify and Framer ·
Cloudflare Pages dashboard status strings · Cloudflare for SaaS validation backoff
schedule · whether Squarespace offers nameserver delegation for third-party domains.
