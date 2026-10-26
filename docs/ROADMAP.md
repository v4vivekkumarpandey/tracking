# Own tracking platform: architecture and roadmap

**Strategy in one line:** launch now on a rented, white-labelled tracker. Build our own platform over 4–6 months, then move brands across one at a time. Revenue starts in month 0, not month 6.

---

## 1. Architecture

```
                   publisher's traffic
                          │
                          ▼
   trk.yourbrand.in ──► tracker (Go) ──302──► advertiser landing page (?click_id=…)
         │                 │  │                         │
         │       link cache│  │click events             │ sale / lead happens
         │                 ▼  ▼ (batched, 1s)           │
         │              Redis  ClickHouse ◄─────────────┼────────────┐
         │                 ▲                            ▼            │
         │   dedup (SET NX)│                  advertiser server      │
         │                 │                            │            │
         └──── /postback ◄─┴────────────────────────────┘            │
                   │                                                 │
                   ▼  one transaction                                │
             PostgreSQL: conversions + outbox job                    │
                   │                                                 │
                   ▼                                                 │
             worker (Go) ── copies sub IDs from click ───────────────┘
                   │
                   ▼
             publisher postback URL(s)  (retries with backoff)

   Next.js dashboards ──reads──► PostgreSQL (money, config) + ClickHouse (click stats)
   Payout run (Phase 3) ──► RazorpayX / Cashfree Payouts API ──webhooks──► payout_items
```

| Component | Why |
|---|---|
| **Go tracker** | One small binary that handles thousands of redirects per second on a cheap server. Click IDs are signed (HMAC) and carry offer, publisher, link and time, so a postback can be attributed without a lookup, and a forged ID is rejected. |
| **PostgreSQL** | Source of truth for anything involving money or configuration: offers, publishers, conversions, approvals, payouts. It has transactions and unique constraints. |
| **ClickHouse** | Clicks run 100–1000× the volume of conversions. ClickHouse stores them compressed and answers reports from an hourly materialized view in milliseconds. |
| **Redis** | Caches link lookups so a click never waits on Postgres. Blocks duplicate conversions atomically (advertisers often re-send the same postback). Holds events temporarily if ClickHouse is down. |
| **Worker** | Sends publisher postbacks from a transactional outbox: no lost postbacks, no double sends, retries with exponential backoff, and every attempt is logged. |
| **Next.js** | Admin dashboard now; advertiser and publisher portals in Phase 2. One codebase. |

### Key design decisions

- **Your own domain from day 0, two subdomains.** The rented platform runs white-labelled on `go.yourbrand.in` (CNAME). This platform runs on `trk.yourbrand.in` (Hostinger VPS). Publishers only ever see your brand. The two platforms use different link formats, so when a brand moves, its publishers get new links once. Announce it a week ahead and keep the old links working until the brand's attribution window has passed.
- **Money is calculated in SQL `NUMERIC`**, never floats. Order: goal price → % of sale → offer default, and a per-publisher payout override beats all of them.
- **Two duplicate guards.** Redis catches retries in under 1ms. Unique indexes on `(click_id, goal)` and `(offer_id, txn_id)` are the final guarantee.
- **Conversions start `pending`.** Approve or reject before paying, because brands reject returns and cancellations.

---

## 2. Timeline

### Month 0: launch on a rented platform (week 1–2)

- Pick a platform that has: white-label + custom tracking domain, S2S postbacks, a full REST API (needed for migration), INR, and publisher postbacks. Indian options with INR pricing: **Trackier**, **Offer18**. Global: **Everflow**, **Affise**, **Scaleo**.
- Point `go.yourbrand.in` at it via CNAME. Never hand out the vendor's domain. (`trk.yourbrand.in` is kept for this platform.)
- Start signing brands and publishers. Keep a simple sheet of each brand's integration (S2S vs pixel, their macros), because you'll redo each one at migration.

### Months 1–2: Phase 1, the core (this repository)

- [x] Click redirect with signed click IDs, macros, bot/duplicate flags
- [x] S2S postback + pixel, Redis dedup, attribution window, goals, % and fixed payouts
- [x] Postgres schema incl. KYC and payout tables
- [x] ClickHouse clicks + hourly stats
- [x] Worker: publisher postbacks with retry + delivery log, ClickHouse spill recovery
- [x] Admin: advertisers, publishers, offers, goals, approvals/links, postbacks, conversions review, reports
- [ ] Load test (target: 2k clicks/s on a 4 vCPU VPS, p99 < 20ms)
- [ ] Automated backups (see §4) and uptime monitoring

### Months 2–3: Phase 2, portals and controls

- Publisher portal: sign-up → admin approval, offer marketplace + "request access", their links, their stats, their own postback settings, payment details form.
- Advertiser portal: their offers' stats, conversion list, approve/reject (with reason), integration instructions.
- Users and roles (the `users` table exists), password reset, 2FA for admins.
- Caps: daily/monthly click and conversion caps per offer and per publisher. Over cap → fallback offer.
- Targeting: geo (country via Cloudflare header or MaxMind GeoLite2), device/OS. Mismatch → fallback.
- Smart link: one publisher link that rotates offers by geo/device/EPC.
- REST API with API keys for publishers (stats, offers) and advertisers (conversion status updates).
- Bulk approve/reject conversions via CSV.

### Months 3–4: Phase 3, payouts

1. **Publisher KYC:** PAN (mandatory for TDS), GSTIN if registered, bank account + IFSC or UPI. Verify the bank account with **penny-drop** (RazorpayX / Cashfree Verification API), and verify the PAN.
2. **Monthly statement:** sum `approved` conversions for the period, net of reversals. Lock those conversions so later status changes can't change a paid month (adjust next month instead).
3. **Tax.** Confirm with your CA:
   - TDS on publisher payouts, usually **194H (commission)** or **194J (professional/technical fees)** depending on the contract. Deduct at the applicable rate, a higher rate without PAN. Deposit monthly, file 26Q quarterly, issue Form 16A.
   - GST: GST-registered publishers invoice you with GST, and you claim ITC. Unregistered publishers: no GST.
   - Your advertiser invoices: GST at 18% on your revenue.
4. **Payout batch:** create a `payout_batches` row with one `payout_items` row per publisher (gross, TDS, GST, net). An admin reviews it, then a second admin approves it (maker-checker).
5. **Send via RazorpayX or Cashfree Payouts:** pick one first, add the other later as a fallback.
   - Create a contact + fund account per publisher once, then reuse them.
   - Send each payout with an **idempotency key = payout_item id**, so a retry can never pay twice.
   - Track status from **webhooks** (`processed`, `reversed`, `failed`). Never assume success from the API response alone.
   - Daily reconciliation job: compare provider statement vs `payout_items`.
6. **Advertiser invoicing:** monthly invoice from approved revenue, payment tracking, ageing report.

### Months 4–5: Phase 4, fraud, reliability, observability

- Fraud: datacenter/VPN IP lists (ASN), click spamming (clicks per IP/sub), CTIT (click-to-install/convert time) too short or too long, conversion-rate anomalies per publisher, duplicate device fingerprints. Show a publisher quality score in reports.
- Alerts: postback failures, CR drops per offer (often a broken advertiser integration), spill list growing, disk usage.
- Monitoring: Prometheus metrics in the Go services + Grafana, or Uptime Kuma to start.
- Audit: all admin actions are already written to `audit_log`; add a viewer.
- Security: rate limits on `/postback`, IP allowlists per advertiser (optional), rotation of advertiser secrets.

### Months 5–6: Phase 5, migrate brand by brand

For each brand, smallest first:

1. **Import:** use the rented platform's API to pull the offer, goals, payouts, approved publishers and their postback URLs. Create the same records here; approving each publisher generates their new `trk.yourbrand.in` link.
2. **Parallel run (1–2 weeks):** the advertiser sends their postback to **both** systems: they store whichever click ID came in on the landing URL and fire it to the matching platform. Move a few publishers (or a share of traffic) to the new links first.
3. **Reconcile daily:** clicks, conversions and payouts must match within ~1–2%. Investigate every gap with `postback_log`, which records every postback received with its exact parameters.
4. **Cut over:** send all of that brand's publishers their new links with a date. Publisher postbacks now come from us. Leave the old `go.yourbrand.in` offer running until its attribution window ends.
5. **Close out** the brand on the rented platform after its attribution window expires (e.g. 30 days), so late conversions on old clicks are still credited there.
6. Pay publishers for the switchover month from both systems' approved totals.

Cancel the rented platform only after the last brand's attribution window has closed.

---

## 3. Hosting: Hostinger

- **Existing Hostinger Web Hosting (shared):** keeps the marketing website on `yourbrand.in`. It only runs PHP/MySQL, so it can't run the tracker.
- **New Hostinger VPS, KVM 2 to start** (2 vCPU, 8 GB), India location, "Ubuntu 24.04 with Docker" template: runs this platform on `trk.` and `admin.yourbrand.in`. Upgrade to KVM 4 in hPanel when CPU or disk stays above ~60%.
- HTTPS via Caddy (included, automatic). Cloudflare in front is optional.

Step-by-step instructions: **[DEPLOY-HOSTINGER.md](DEPLOY-HOSTINGER.md)**.

## 4. Backups

- **Postgres** (critical, it holds money): nightly `pg_dump` to off-server storage (Backblaze B2 / S3), kept 30 days, plus WAL archiving (e.g. `pgBackRest`) once you have real revenue. Test a restore monthly.
- **ClickHouse:** `BACKUP DATABASE tracking TO S3(...)` weekly. Clicks can't be rebuilt from anywhere else, but losing them affects reports, not payments.
- **Redis:** AOF is on. Its data is cache, dedup keys and temporary spill, so loss is tolerable.
- **`CLICK_SECRET`:** store it in a password manager. Lose it, and every click still in its attribution window can no longer be credited.
