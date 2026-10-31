# Deploying the Lite version on Hostinger shared hosting

The **Lite version** (`apps/lite`) is one Next.js app plus a MySQL database. It runs on Hostinger shared plans that offer **Node.js web apps**. Yours does: its Web App details list Next.js and Node 18–24.

It runs the same tracker as the VPS version: signed click IDs, S2S postbacks and pixels, goals, % and fixed payouts, duplicate protection, publisher postbacks with retries, and the same dashboard. The differences:

| | Lite (shared hosting) | Full (VPS) |
|---|---|---|
| Database | MySQL/MariaDB only | PostgreSQL + ClickHouse + Redis |
| Comfortable volume | up to ~50k–100k clicks/day | millions/day |
| Raw click history | 90 days (hourly stats kept forever) | 13 months |
| Background jobs | Run right after each sale, plus a cron job every minute | Always-on worker |

Click IDs use the same format in both versions. With the same `CLICK_SECRET`, you can move to the VPS later and clicks still in their attribution window keep converting.

## The three panels

| Panel | Address | Who signs in | What they can do |
|---|---|---|---|
| **Admin** | `/admin` | You (`ADMIN_EMAIL` / `ADMIN_PASSWORD`) | Everything, plus **Approvals** (new sign-ups, offer access requests, offers submitted by advertisers) and **Payments** (balances owed, record payouts) |
| **Advertiser** | `/advertiser` | Brands that signed up at `/signup/advertiser` | Stats for their own offers, **approve/reject** their conversions, **submit offers** (go live after you approve them and set the publisher payout), integration guide with their postback secret and a log of the postbacks they sent |
| **Publisher** | `/publisher` | Affiliates who signed up at `/signup/publisher` | **Offer marketplace** (request access → you approve → they get a tracking link), stats by day/offer/sub ID, their conversions (payout only), their **own postback URLs** (with a test button), **payment details**, balance and payment history |

- Everyone signs in at `/login`, and the site sends each person to their own panel.
- New sign-ups stay **pending** until you approve them in **Admin → Approvals**. The red badge in the sidebar counts what's waiting.
- Advertisers never see publisher identities or payouts, only "Publisher #id". Publishers never see revenue, your margin or advertisers' order IDs.
- Accounts you create yourself in the admin panel: click **Create login** next to them to generate a temporary password, or **Set password** to choose one yourself. Forgotten passwords work the same way. Sending email isn't built in yet.
- **Publisher profile & payment methods:** publishers edit their contact details (email, phone, Telegram/Skype/WhatsApp, address, traffic sources) and save up to 5 payment methods (PayPal, bank transfer with IFSC/SWIFT, UPI, Payoneer, Wise, USDT, other), one as default. Adding or switching a method needs their password. When a publisher's payment details change, **Payments** and the publisher's page show a warning for 7 days: confirm with them before paying, because changed payout details are the classic sign of a hijacked account. Admins can edit the profile (including the sign-in email) and manage methods on the publisher's page.
- **Advertisers** (Admin → Advertisers): search by name, company, email, reference ID or account manager, and filter by status. **+ Add advertiser** takes full name, email (must be unique), account manager, status, reference ID (e.g. their Everflow ID), password, company, website, tax ID and notes. With a password (type one or click *Generate*) the advertiser can sign in at once with their email. Leave it empty to create the login later. Notes, reference ID and account manager are visible only to admins. Click an advertiser to edit them, pause or activate them, set their password, and see their offers and postback URL.
- **Merge publishers** (duplicate accounts): open the publisher you want to keep → **Merge another publisher into this one**. Everything of the other publisher moves over: tracking links (same codes, so links already in use keep working), clicks, conversions, balance, payments, offer access (the better status and the existing payout override win), postbacks (duplicates dropped), smart links, domains and referrals. Sales on the other publisher's older clicks are credited to the kept one. Its payment methods move only if the kept publisher has none; its login moves only if the kept publisher has no login, otherwise it's removed. The other publisher is then deleted; this can't be undone.
- First thing after deploying: open **Admin → Settings** and fill in your company details (they're printed on invoices), referral % and duration, and optionally the default auto-approve days.
- **Finance:** Admin → **Invoices** generates monthly advertiser invoices from approved conversions (Print / Save as PDF). Admin → **Payments** shows what you owe publishers, including referral commission.
- **Visitor countries and networks** come from the free DB-IP Lite databases bundled in `apps/lite/data/` (country and ASN). Refresh them about once a month by running `node scripts/update-geoip.mjs`, then commit and push. The required "IP geolocation by DB-IP" credit appears at the bottom of the sidebar.
- **Traffic sources:** every click is labelled with where it came from (Google Ads, Microsoft/Bing Ads, Meta Ads, TikTok Ads, organic Google/Bing, Facebook/Instagram, email, native, push, other website, or Direct / unknown). Paid traffic is detected reliably from the click IDs ad networks add to URLs (`gclid`, `msclkid`, `fbclid`, `ttclid`…). Organic and referral detection relies on the browser's Referer header, which many apps and privacy settings remove, so a share of clicks always shows as Direct / unknown. Group any **Reports** page by *Traffic source* or *Channel* (last 90 days). In **Edit offer → Traffic sources**, tick the sources an advertiser forbids (e.g. Google Ads brand bidding): clicks still redirect, but conversions from those sources get fraud score 70+, are held (never auto-approved) and listed under **Disallowed traffic** on the admin dashboard.
- **Traffic protection** (Admin → Protection): every click is tagged with its network (from the bundled DB-IP ASN database). Clicks from data centers, cloud servers and commercial VPNs are flagged and add +40 to a conversion's fraud score, or, if you switch it to *Block*, never reach an offer. Block single IPs, ranges (`203.0.113.0/24`) or whole networks (`AS14061`); the page lists the busiest IPs and data-center networks with one-click Block buttons.
- **Click log** (all three panels): search raw clicks by click ID, sub ID, or (admin only) IP / `AS` number. Pasting a click ID shows who it belongs to, whether it converted and every postback received for it: the quickest way to settle "you missed my conversion".
- **Publisher parameters:** tracking links accept `source_id` and `sub1`–`sub10` (Everflow-style). They are stored on the click and its conversions, can be used as `{source_id}`, `{sub1}`…`{sub10}` in landing-page URLs and publisher postbacks, and searched in Reports (group by Source ID / Sub ID 1) and the Click log.
- **Bulk import / export offers** (Admin → Offers → **Import / Export**): download the template, fill one offer per row in Excel or Google Sheets and upload it as .xlsx or .csv (up to 1,000 offers, 2 MB). Rows without an `id` create offers; rows with an existing `id` update that offer, and only the columns in the file change (a file with just `id,payout` changes only payouts). **Preview** checks every row first and nothing is saved until you click **Import**; rows with errors (unknown advertiser, bad URL, wrong country code…) are skipped and listed. **Export all offers** gives the same format, so you can edit offers in Excel and upload them again. Every change is in the audit log. Logos, creatives, landing pages and goals stay on the offer page.
- **Offer info for publishers:** on the new-offer and Edit offer forms, fill in Category, Preview URL, Description, KPI / traffic rules and Terms; tick *Publishers must accept the terms* to require an "I accept" before a publisher gets a link (the time they accepted is stored). Upload a logo on the offer page; it shows on the marketplace card.
- **Visibility:** *Public, instant link* (publishers get their link at once), *Public, approval required* (they request, you approve) or *Private* (only publishers you add). Switching an offer to instant approves the requests already waiting.
- **OS targeting:** in Edit offer → Targeting, tick Android / iOS / Windows / Mac (none = all). Other visitors go to the fallback, like geo and device targeting.
- **Link test** (admin and publisher panels): paste a tracking link to see every redirect hop up to the offer page with its timing, and whether the click ID reaches the advertiser. It runs from the server (so the country is US) and lets you choose desktop, Android or iPhone. The test click is stored as a bot click and not counted in stats. Publishers can only test their own links.
- **Dashboard:** each card shows Today, Yesterday, MTD (month to date) and Last month; the admin dashboard shows Profit (revenue − payout).
- **Landing pages:** an offer can have extra landing pages (Admin or Advertiser → offer page). Publishers pick one in their link builder (`&lp=ID`); visitors without a choice are split by each page's %, the rest go to the default URL. Reports can be grouped by *Landing page*.
- **Conversion tracking without click_id storage:** Advertiser → Integration now offers a JavaScript tag (`/t.js`, stores the click ID in the advertiser's own first-party cookie and reports the sale with `trk('conversion', …)`) and a cookie-matched pixel (`/px?offer_id=…`, works in Chrome/Edge, or everywhere when served from the advertiser's own tracking domain).
- Publishers and advertisers can use **their own tracking domain** (e.g. `track.theirsite.com`). This needs a one-time Cloudflare setup; see [CUSTOM-DOMAINS.md](CUSTOM-DOMAINS.md).
- Put **Join as a publisher** (`https://trk.ossaward.org/signup/publisher`) and **Advertise with us** (`/signup/advertiser`) links on your main website.

> hPanel menu names change from time to time. If a label below doesn't match exactly, look for the closest one.

---

## 1. Create the database

hPanel → **Databases** → **Management** (MySQL Databases):

1. Create a database, e.g. `tracking`. Hostinger adds a prefix, so the full name looks like `u678573632_tracking`.
2. Create a user (e.g. `u678573632_trk`) with a **strong password**, and give it access to that database.
3. Write down the **database name, user, password and host**. The host is usually `localhost`; if hPanel shows a different MySQL hostname, use that.

You don't need to create any tables. The app creates them on first start.

## 2. Generate secrets

In PowerShell on your PC, run this **four times** and save each result in a password manager. They become `CLICK_SECRET`, `SESSION_SECRET`, `CRON_SECRET` and `ADMIN_PASSWORD`:

```powershell
$b = New-Object byte[] 24; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); ($b | % { $_.ToString('x2') }) -join ''
```

`CLICK_SECRET` is the most important one. If it's lost or changed, every existing click stops converting. Never change it once you're live.

## 3. Build the upload file

In the project folder on your PC:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\package-lite.ps1
```

This creates `tracking-lite.zip` (about 50 KB).

## 4. Create the Node.js web app

hPanel → **Websites** → **Add website** → **Node.js app** (it may say "Web app"):

1. **Domain:** use a subdomain such as **`trk.ossaward.org`**. Your main `ossaward.org` site is unaffected.
2. **Source:** **Upload files** → choose `tracking-lite.zip`. Alternatively, connect a private GitHub repo with root directory `apps/lite`.
3. **Framework:** Next.js. **Node version:** 22.x (or 24.x).
4. **Build command:** `npm run build`. **Start command:** `npm start`. These are usually filled in automatically.
5. **Environment variables:** add each of these:

| Name | Value |
|---|---|
| `DB_HOST` | `localhost` (or the host from step 1) |
| `DB_PORT` | `3306` |
| `DB_NAME` | from step 1 |
| `DB_USER` | from step 1 |
| `DB_PASSWORD` | from step 1 |
| `CLICK_SECRET` | from step 2 |
| `SESSION_SECRET` | from step 2 |
| `CRON_SECRET` | from step 2 |
| `ADMIN_EMAIL` | your email |
| `ADMIN_PASSWORD` | from step 2 |
| `TRACKING_BASE_URL` | `https://trk.ossaward.org` |
| `FALLBACK_URL` | `https://ossaward.org` (where unknown/paused links go) |
| `CURRENCY` | `USD` |
| `DISPLAY_TIMEZONE` | e.g. `America/New_York` or `UTC` |
| `SECURE_COOKIES` | `true` |
| `BRAND_NAME` | your network's name, shown on login, sign-up and the panels (e.g. `OSS Award`) |

Never set `ALLOW_PRIVATE_POSTBACKS` on Hostinger. It's a local-testing switch that turns off the check stopping publisher postback URLs from pointing at internal addresses.

6. **Deploy.** The build takes a few minutes. Make sure SSL is enabled for the subdomain (hPanel → Security → SSL); Hostinger usually adds it automatically.

## 5. Check that it works

Open these in your browser:

1. `https://trk.ossaward.org/healthz` → **`ok`**. The first visit creates the database tables.
2. `https://trk.ossaward.org/api/whoami` → the **`ip`** value must be **your own public IP**. Compare it with any "what is my IP" website. If it shows a different address (the hosting server's), send me the whole output. Click IP tracking then needs a one-line adjustment for Hostinger's proxy.
3. `https://trk.ossaward.org/login` → sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

**Quick end-to-end test:**
1. **Advertisers** → add "Test Brand".
2. **Offers** → new offer with destination `https://example.com/?click_id={click_id}`, payout $1.
3. **Publishers** → add "Test Pub". Open the offer → **Approve & create link**.
4. Open the tracking link in your browser. You should land on example.com with a `click_id` in the address bar.
5. Copy that `click_id` and open the **S2S postback URL** shown on the offer page, with `{CLICK_ID}` replaced and the other `{...}` parts removed. You should get `{"status":"ok",...}`.
6. **Conversions** shows the sale; **Reports** shows the click.

Then archive the test offer.

## 6. Cron job (every minute)

hPanel → **Advanced** → **Cron Jobs** → create a **custom** job that runs **every minute**:

```
wget -q -O /dev/null "https://trk.ossaward.org/api/cron?key=YOUR_CRON_SECRET"
```

If `wget` isn't allowed, use `curl -s "https://trk.ossaward.org/api/cron?key=YOUR_CRON_SECRET" > /dev/null` instead.

The cron job retries publisher postbacks that failed (first sends happen instantly after each sale) and deletes raw clicks older than `CLICK_RETENTION_DAYS` (default 90).

## 7. Backups

- Hostinger backs up shared hosting automatically (hPanel → **Files** → **Backups**). Check how often your plan does this.
- **Once a month**, also export the database yourself: hPanel → Databases → **phpMyAdmin** → select the database → **Export** → Quick → SQL. Keep the file off the server.

## 8. Updating

Run `scripts\package-lite.ps1` again, upload the new zip in the web app's settings, and redeploy. Any new database tables or columns are added automatically on start.

## 9. When to move to the VPS

Move when you see any of these:
- Redirects feel slow, or you get 503/508 errors
- Hostinger warns about resource usage
- You regularly pass ~50k–100k clicks a day

Then follow [DEPLOY-HOSTINGER.md](DEPLOY-HOSTINGER.md) for a Hostinger VPS. Keep the same `CLICK_SECRET`, and ask me for a data migration script for advertisers, offers, publishers, links and conversions.
