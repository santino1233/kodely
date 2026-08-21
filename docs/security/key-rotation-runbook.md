# Kodely service-key rotation runbook

Owner: Kodely operator (single-operator today).
Covers **Kodely's own service credentials** — not end-user passwords or the
secrets inside generated sites.

Board cards this closes: *"Service-key rotation runbook"* (My Roadmap, Phase A)
and *"Service-key rotation runbook (Anthropic / Stripe / Nxeon / Cloudflare)"*
(Trust, Legal & Compliance).

## Why this exists

Two live keys were pasted in plaintext into a board card. A one-off "change the
key" is not a fix — a credential with no rotation process is a credential you
cannot reason about. This defines a standing process so exposure is a routine
event, not a crisis.

**Assume any secret that has ever appeared in chat, a board card, a ticket, a
screenshot, or a file on the Desktop is compromised and must be rotated.**

---

## 1. Standing rules

1. **Secrets live in exactly two places:** the issuing provider's console, and
   `/opt/kodely/.env` + `/opt/kodely-staging/.env` on VM 110. Nowhere else.
2. **`.env` is gitignored and never leaves the VM.** Do not copy it to your
   laptop, do not paste it into a chat, do not commit it. The VM is the source
   of truth (same rule as `package-lock.json`).
3. **Never paste a secret into a Kanban card, chat message, or commit message** —
   including "temporarily". Reference the *name* (`ANTHROPIC_API_KEY`), never
   the value.
4. **Prod and staging get separate credentials** wherever the provider allows
   it, so a staging leak can't touch production or real money.
5. **Rotate forward, then revoke.** Create the new credential, deploy it, verify
   it works, and only then revoke the old one. Revoking first causes an outage.
6. Any secret file that must exist on disk temporarily gets `chmod 600` and is
   deleted immediately after use — not left on the Desktop.

---

## 2. Secret inventory

| Secret | Used by | Lives in | If leaked | Rotate |
|---|---|---|---|---|
| `ANTHROPIC_API_KEY` | Codegen agent (every build) | prod + staging `.env` | Unbounded spend on your account; the #1 cost risk on the board | Quarterly + on exposure |
| `STRIPE_SECRET_KEY` | Checkout session creation | prod `.env` | Real money movement, refunds, customer data | Quarterly + on exposure |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature verification | prod `.env` | Forged webhooks → **free credits granted without payment** | Quarterly + on exposure |
| `DATABASE_URL` (Postgres role `kodely`) | Prisma, both envs | prod + staging `.env` | Full read/write of all user accounts, projects, credit ledger | Semi-annually + on exposure |
| `GOOGLE_CLIENT_SECRET` | Google OAuth sign-in | prod `.env` | Account takeover via forged OAuth flow | Semi-annually + on exposure |
| GitHub deploy key (`~/.ssh/kodely_github`) | VM → GitHub, write access | VM 110, `kodely` user | **Supply chain**: attacker pushes to `main`, which deploys | Semi-annually + on exposure |
| Host → VM SSH key (`/root/.ssh/id_rsa`) | Proxmox host → VM 110 | Proxmox host root | Full VM control | Semi-annually + on exposure |
| Cloudflare API / tunnel token | DNS + edge for kodely.me / kodely.site | Cloudflare + VM | DNS hijack of your domains; traffic interception | Semi-annually + on exposure |
| Nxeon partner API signing key | Kodely ↔ Nxeon bridge | both sides | Cross-product trust boundary breach | Semi-annually + on exposure |

**Session tokens** need no rotation entry: they're random and stored
`scrypt`-hashed (`lib/auth.ts`), with no standalone signing secret. To
invalidate all sessions, delete the session rows.

---

## 3. Routine rotation (quarterly)

Do these one at a time. Verify each before starting the next.

### Anthropic

1. Anthropic Console → API keys → **Create key** (`kodely-prod-<YYYYMM>`).
2. On VM 110, edit `/opt/kodely/.env`, replace the value, then:
   ```bash
   sudo systemctl restart kodely
   ```
3. Verify with a **real generation** (health check alone won't exercise the key):
   sign in to kodely.me, create a project, confirm the build succeeds.
4. Repeat for staging with a separate key, restarting `kodely-staging`.
5. Only now: revoke the old key in the console.

> Prod **and** staging `.env` were both missing `ANTHROPIC_API_KEY` once and it
> wasn't noticed until a real generation was attempted. A green `/api/health`
> does not prove the codegen path works.

### Stripe

1. Stripe Dashboard → Developers → API keys → **Roll** the secret key. Choose a
   grace period rather than immediate expiry.
2. Update `STRIPE_SECRET_KEY` in prod `.env`, restart `kodely`.
3. Webhook secret: Developers → Webhooks → endpoint → **Roll signing secret**.
   Update `STRIPE_WEBHOOK_SECRET`, restart.
4. Verify: send a test event from the Stripe dashboard and confirm it is
   accepted (a bad `STRIPE_WEBHOOK_SECRET` fails *closed* — credits silently
   stop being granted, which is easy to miss).
5. Let the old key expire.

### Postgres role

```bash
sudo -u postgres psql -c "ALTER ROLE kodely WITH PASSWORD 'NEW_PASSWORD';"
```
Update `DATABASE_URL` in **both** `/opt/kodely/.env` and
`/opt/kodely-staging/.env` (URL-encode any special characters), then:
```bash
sudo systemctl restart kodely kodely-staging
```
Verify: load a page that reads the DB (dashboard or `/blog`).

### Google OAuth

1. Google Cloud Console → Credentials → the OAuth client → add a new secret.
2. Update `GOOGLE_CLIENT_SECRET` in prod `.env`, restart.
3. Verify a real Google sign-in end to end.
4. Delete the old secret.

### GitHub deploy key

```bash
ssh-keygen -t ed25519 -f ~/.ssh/kodely_github_new -C "kodely-app@10.20.0.30"
```
Add the new public key to `github.com/santino1233/kodely` → Deploy keys (allow
write). Point `~/.ssh/config` at the new file, then verify:
```bash
git -C /opt/kodely fetch origin
```
Only once that succeeds: delete the old deploy key on GitHub and remove the old
private key from the VM.

---

## 4. Emergency rotation (suspected exposure)

Work top to bottom. Do **not** wait for a maintenance window.

1. **Contain first.** Revoke immediately — before any tidy-up — if the exposure
   is public or the key can move money or spend:
   - Anthropic: delete the key in the console.
   - Stripe: roll with **immediate** expiry.
   - GitHub deploy key: delete it (this also stops attacker-triggered deploys).
2. **Rotate** using the routine procedure above; a short outage is acceptable
   here, unlike routine rotation.
3. **Assess blast radius:**
   - Anthropic → Console usage graph for unexpected spend.
   - Stripe → recent payments/refunds; check the `StripeEvent` claim rows for
     credit grants without matching payments.
   - Postgres → unexpected `User` / credit-ledger rows.
   - GitHub → repo Audit log for pushes you didn't make; diff `main` against the
     last commit you recognise.
   - VM → `last`, `journalctl -u ssh`.
4. **Scrub the exposure** (board card, chat, file) — *after* rotating. Deleting
   the card first does not un-leak the key and loses the audit trail.
5. **Write it down**: what leaked, where, when, when it was rotated, what the
   usage review showed.

---

## 5. Immediate action items

These are known, currently-outstanding exposures.

- [ ] **Rotate the two keys pasted into the board card.** Still recorded as
      unrotated. Then edit the card to remove the values.
- [ ] **Three plaintext credential files on the Desktop** —
      `anthropic api key.txt`, `stripe_backup_code.txt`, `claude_code.pem`.
      A Desktop inside a synced OneDrive folder means these are also in cloud
      storage and version history. Rotate what they contain, then delete them
      and purge OneDrive's version history.
- [ ] **Check whether OneDrive has synced any `.env`.** `.gitignore` stops git,
      not file sync.
- [ ] Set a recurring quarterly reminder for §3.

---

## 6. Verification checklist

After **any** rotation:

```bash
curl -s https://kodely.me/api/health
curl -s https://staging.kodely.me/api/health
```

- [ ] Both return `{"ok":true}`
- [ ] A **real generation** completes (proves `ANTHROPIC_API_KEY` and the DB)
- [ ] A publish serves on `*.kodely.site`
- [ ] Stripe test event accepted (if Stripe was rotated)
- [ ] Old credential confirmed revoked at the provider
- [ ] If a deploy was involved, `BUILD_ID` is newer than the deploy:
      ```bash
      ls -l /opt/kodely/.next/BUILD_ID
      ```
      `systemctl` reporting *active* proves the process is up — not that it is
      running the new code.
