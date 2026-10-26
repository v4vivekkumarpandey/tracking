# Tracking platform

An affiliate/performance tracking system: click redirects, conversion postbacks, publisher postbacks, an admin dashboard and reports.
See [docs/ROADMAP.md](docs/ROADMAP.md) for the architecture and the 4–6 month plan, and [docs/DEPLOY-HOSTINGER.md](docs/DEPLOY-HOSTINGER.md) to put it live on a Hostinger VPS.

| Path | What |
|---|---|
| `services/go` | `tracker` (clicks + postbacks), `worker` (publisher postbacks, retries), `migrate` |
| `apps/web` | Next.js admin dashboard |
| `apps/lite` | **Lite version** for shared hosting: one Next.js app + MySQL. See [docs/DEPLOY-SHARED.md](docs/DEPLOY-SHARED.md) |
| `db/postgres/migrations` | Postgres schema (goose) |
| `db/clickhouse/init.sql` | ClickHouse tables + hourly stats view |
| `scripts/seed.sql` | Demo advertiser, publisher, offer and link |

## Run locally

Needs Docker Desktop. You don't need Go or Node installed locally: everything builds inside containers, and the Go tests run during the build.

```powershell
Copy-Item .env.example .env      # then edit the values
docker compose up -d --build
docker compose run --rm migrate migrate -seed /scripts/seed.sql
```

- Dashboard: http://localhost:3000 (log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`)
- Tracker: http://localhost:8080
- Mock publisher endpoint (httpbin): http://localhost:8081

## Try the full flow

```powershell
# 1. A click. Expect a 302 to example.com with click_id=... in the URL.
curl.exe -s -o NUL -w "%{redirect_url}`n" "http://localhost:8080/c/demo123?sub1=pubclick42"

# 2. Copy the click_id from that URL, then report a ₹2,000 sale.
$cid = "<paste click_id>"
curl.exe "http://localhost:8080/postback?click_id=$cid&secret=demo-advertiser-secret&txn_id=ORDER1&amount=2000"
#    -> {"status":"ok","conversion_id":1}   revenue ₹200 (10%), payout ₹140 (7%)

# 3. Send it again: duplicates are ignored.
curl.exe "http://localhost:8080/postback?click_id=$cid&secret=demo-advertiser-secret&txn_id=ORDER1&amount=2000"
#    -> {"status":"duplicate"}

# 4. A fixed-price goal on the same click.
curl.exe "http://localhost:8080/postback?click_id=$cid&secret=demo-advertiser-secret&goal=lead"
```

Within a few seconds the worker sends the publisher postback (`sub1=pubclick42`, `payout=140.00`) to httpbin. You can see it in the dashboard under **Publishers → Demo Publisher → Recent postback deliveries**, or with `docker compose logs httpbin`.

## Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /c/{code}?sub1..sub5` | Click → 302 to the offer URL with macros filled in |
| `GET\|POST /postback?click_id&secret&txn_id&amount&goal` | Advertiser server-to-server conversion |
| `GET /px?click_id&txn_id&amount&goal` | Browser pixel conversion (no secret, marked `source=pixel`) |
| `GET /healthz` | Health check |

Postback responses: `200 {"status":"ok"}`, `200 {"status":"duplicate"}`, or `4xx {"status":"rejected","error":"..."}`. Every postback, accepted or not, is stored in `postback_log`.

Macros in offer URLs: `{click_id} {offer_id} {pub_id} {sub1}..{sub5}`.
Macros in publisher postbacks: also `{payout} {amount} {goal} {txn_id} {conversion_id} {status}`.

## Development notes

- The first Go build runs `go mod tidy` to create `go.sum`. Commit that file to pin dependency versions.
- Pausing a link, offer or publisher reaches the tracker within `LINK_CACHE_TTL` (60s).
- Report days are UTC. The dashboard shows times in IST.
