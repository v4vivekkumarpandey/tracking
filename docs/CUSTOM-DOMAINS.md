# Custom tracking domains (publishers & advertisers)

Publishers and advertisers can serve tracking from **their own domain**, e.g. `https://track.theirsite.com/c/AbC123`, instead of `trk.ossaward.org`:

- **Publishers** get branded links: the domain shows up in the link builder on every offer.
- **Advertisers** get first-party tracking: their pixel and postback snippets use their domain, and publishers' links to their offers default to it. First-party tracking is blocked less by browsers and ad blockers.

Your Hostinger web app can only hold one domain with SSL, so customer domains run through **Cloudflare for SaaS**, which issues SSL for each customer domain automatically. A small **Cloudflare Worker** forwards that traffic to your Hostinger app.

```
visitor → track.theirsite.com ─CNAME→ domains.ossaward.org
        → Cloudflare (SSL for track.theirsite.com) → Worker
        → https://trk.ossaward.org (your Hostinger app, unchanged)
```

**Cost:** Cloudflare Free plan. The first 100 custom domains are free, then $0.10 per domain per month. Cloudflare may ask for a payment method before enabling custom hostnames.

> You do this setup **once**. Menu names in Cloudflare change occasionally; look for the closest match.

---

## 1. Move ossaward.org DNS to Cloudflare

1. Create a free account at cloudflare.com → **Add a site** → `ossaward.org` → **Free** plan.
2. Cloudflare imports your existing DNS records. **Check that they're all there**, especially:
   - `@` and `www` (your website), plus any `MX`/`TXT` records (email)
   - `trk`, which must point where it does today (Hostinger)
3. Set **`trk` to DNS only (grey cloud)**. This is important: the app stays reached directly, and Hostinger keeps renewing its SSL.
4. Cloudflare shows two nameservers. In **hPanel → Domains → ossaward.org → DNS / Nameservers → Change nameservers**, enter them.
5. Wait until Cloudflare says the site is **Active**, usually within an hour.

## 2. DNS records for customer domains

In Cloudflare → **DNS → Records**, add:

| Type | Name | Content | Proxy |
|---|---|---|---|
| AAAA | `fallback` | `100::` | **Proxied (orange)** |
| CNAME | `domains` | `fallback.ossaward.org` | **Proxied (orange)** |

`100::` is a placeholder address: the Worker answers these requests, so no server is needed behind it. Customers point their CNAME at `domains.ossaward.org`.

## 3. Turn on Cloudflare for SaaS

**SSL/TLS → Custom Hostnames**:
1. **Enable** custom hostnames (add a payment method if asked).
2. **Fallback origin:** `fallback.ossaward.org` → Add. Wait until it shows **Active**.

## 4. Create the Worker

1. **Workers & Pages → Create → Worker**, name it e.g. `tracking-domains`, then **Deploy**.
2. **Edit code**: replace everything with the contents of `deploy/cloudflare/worker.js` from this project → **Deploy**.
3. **Settings → Variables and Secrets**:
   - `ORIGIN` = `https://trk.ossaward.org`
   - `PROXY_SECRET` (type **Secret**) = a long random value. Generate one in PowerShell:
     ```powershell
     $b = New-Object byte[] 24; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); ($b | % { $_.ToString('x2') }) -join ''
     ```
4. Back on the **ossaward.org** site: **Workers Routes → Add route**. Route `*/*`, Worker `tracking-domains`.
   The Worker passes requests for your own `*.ossaward.org` hostnames straight through, and `trk` is DNS-only, so it never reaches the Worker anyway.

## 5. API token for the app

1. **My Profile → API Tokens → Create Token → Custom token**:
   - Permissions: **Zone → SSL and Certificates → Edit**
   - Zone resources: **Include → Specific zone → ossaward.org**
2. Copy the token. Also copy the **Zone ID** from the ossaward.org **Overview** page (right column).

## 6. Configure the app on Hostinger

hPanel → your Node.js web app → **Environment variables**, add:

| Name | Value |
|---|---|
| `CF_API_TOKEN` | the token from step 5 |
| `CF_ZONE_ID` | the Zone ID |
| `CNAME_TARGET` | `domains.ossaward.org` |
| `PROXY_SECRET` | the **same** value as in the Worker |

**Redeploy**. Then open **Admin → Domains**. The setup card should show *Cloudflare API: connected* and *PROXY_SECRET set*.

## 7. Test with your own domain

1. Sign in as a publisher (or create a test publisher). Go to **Domains** and add e.g. `track.yourtestdomain.com`.
2. At that domain's DNS, add `CNAME track → domains.ossaward.org`.
3. Within minutes to an hour, the status turns **active**. The cron job checks automatically, or click **Check now**.
4. Open an approved offer, choose the domain in the link builder, and open the link. You should land on the offer.
5. In **Admin → Reporting**, the click appears with the visitor's country.

## What your publishers and advertisers do

1. **Domains** in their panel → add `track.theirsite.com`.
2. Create the CNAME record shown on the page.
3. Wait for **active**. Then:
   - Publishers choose the domain in the link builder.
   - Advertisers' integration snippets switch to their domain automatically.

They can only use a subdomain (`track.theirsite.com`), not the bare domain (`theirsite.com`).

## Security notes

- A custom domain only serves its owner's links: a publisher's own links, or links to an advertiser's own offers. Any other link code on that domain returns 404.
- Only `/c/…`, `/s/…`, `/postback`, `/px` and `/t.js` work on customer domains. The login page and panels are never reachable there.
- The Worker passes only our own `_trk_…` click cookies (used by the pixel fallback) between the visitor and the app; the customer's other cookies never reach us. If you set the Worker up before this change, paste the new `worker.js` again.
- The app trusts the Worker's headers (domain, visitor IP, country) only when `PROXY_SECRET` matches. Keep it secret, and change it in both places if it leaks.
- Admin → Domains can **Disable** a domain instantly (e.g. abuse) or **Remove** it.
