# Deploying on Hostinger

## What goes where

| Hostinger product | Runs | Domain (example) |
|---|---|---|
| **Your current Web Hosting plan** (shared) | Marketing website (WordPress / site builder): about us, "become a publisher", "advertise with us" | `yourbrand.in`, `www.yourbrand.in` |
| **New Hostinger VPS** | This tracking platform: tracker, dashboard, databases | `trk.yourbrand.in`, `admin.yourbrand.in` |

Shared hosting only runs PHP and MySQL, so the tracker needs the VPS. Both can sit on the same domain: you only add two DNS records.

## 1. Choose the VPS

| Plan | vCPU / RAM / disk | Use it for |
|---|---|---|
| KVM 1 | 1 / 4 GB / 50 GB | Too small: ClickHouse + building the dashboard need more RAM |
| **KVM 2** | 2 / 8 GB / 100 GB | **Start here.** Comfortable up to roughly 1–2 million clicks/day |
| KVM 4 | 4 / 16 GB / 200 GB | Upgrade when CPU stays above ~60% or the disk is half full |
| KVM 8 | 8 / 32 GB / 400 GB | Large volume; at this point also consider splitting ClickHouse onto its own VPS |

Upgrading between KVM plans is a click in hPanel. Data stays where it is, so starting small is safe.

When buying:
- **Location: India**, closest to your visitors, so redirects are faster.
- **Operating system: "Ubuntu 24.04 with Docker"** from the application templates. Docker comes preinstalled.
- Set a strong root password and **add your SSH key** if you have one.
- Note the VPS **IP address** shown in hPanel → VPS → Overview.

## 2. DNS (hPanel → Domains → your domain → DNS / Nameservers)

Add two **A records** and leave the existing `@` and `www` records alone, because those keep pointing to the shared hosting site:

| Type | Name | Points to | TTL |
|---|---|---|---|
| A | `trk` | VPS IP | 3600 |
| A | `admin` | VPS IP | 3600 |

If your domain uses Cloudflare instead, add the same records there with the **grey cloud (DNS only)**. See section 9 before turning on the orange cloud.

Check that they work (from your PC): `nslookup trk.yourbrand.in` should print the VPS IP.

## 3. First login and basic security

From PowerShell on your PC:

```powershell
ssh root@YOUR_VPS_IP
```

On the server:

```bash
apt update && apt upgrade -y
# Firewall: only SSH and web traffic.
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp
ufw --force enable
# Automatic security updates.
apt install -y unattended-upgrades && dpkg-reconfigure -f noninteractive unattended-upgrades
docker --version && docker compose version   # both should print versions
```

Also enable the **firewall in hPanel** (VPS → Security → Firewall) with the same rules: allow 22, 80 and 443.

> Docker-published ports bypass `ufw`. That's why the production setup publishes only Caddy's 80/443; the databases listen on 127.0.0.1 only.

## 4. Upload the code

From PowerShell on your PC, in the project folder:

```powershell
tar --exclude=node_modules --exclude=.next --exclude=.env -czf tracking.tgz .
scp tracking.tgz root@YOUR_VPS_IP:/opt/
```

On the server:

```bash
mkdir -p /opt/tracking && tar -xzf /opt/tracking.tgz -C /opt/tracking && rm /opt/tracking.tgz
cd /opt/tracking && chmod +x scripts/*.sh
```

(Later it's better to keep the code in a private GitHub repo and `git pull` on the server.)

## 5. Create the production `.env`

**Never copy your local `.env`.** Make new secrets on the server:

```bash
cd /opt/tracking
cp .env.example .env
for k in CLICK_SECRET SESSION_SECRET POSTGRES_PASSWORD CLICKHOUSE_PASSWORD ADMIN_PASSWORD; do
  sed -i "s|^$k=.*|$k=$(openssl rand -hex 24)|" .env
done
nano .env
```

In `nano`, set or uncomment these lines:

```ini
ADMIN_EMAIL=you@yourbrand.in
TRACKING_BASE_URL=https://trk.yourbrand.in
FALLBACK_URL=https://yourbrand.in
COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml
TRACKING_DOMAIN=trk.yourbrand.in
ADMIN_DOMAIN=admin.yourbrand.in
ACME_EMAIL=you@yourbrand.in
```

Save (Ctrl+O, Enter, Ctrl+X), then:

```bash
grep ADMIN_PASSWORD .env          # your dashboard password; save it in a password manager
chmod 600 .env
```

**Also store `CLICK_SECRET` in your password manager.** If it's lost or changed, conversions for all existing clicks are rejected.

## 6. Start it

```bash
cd /opt/tracking
docker compose up -d --build      # first build: ~5–10 minutes
docker compose ps                 # every service "running"; migrate "exited (0)"
```

Within a minute Caddy fetches HTTPS certificates. Check:

- `https://trk.yourbrand.in/healthz` → `ok`
- `https://admin.yourbrand.in` → login page

Don't load the demo seed in production. Create your real advertisers, offers and publishers in the dashboard.

## 7. Backups

1. **Nightly database backup** (this server):
   ```bash
   crontab -e
   # add this line:
   30 2 * * * /opt/tracking/scripts/backup.sh >> /var/log/tracking-backup.log 2>&1
   ```
   Test once by hand: `/opt/tracking/scripts/backup.sh`
2. **Off-server copy:** a backup on the same VPS dies with the VPS. Install `rclone` (`apt install rclone`), connect it to Backblaze B2 or Google Drive with `rclone config`, and uncomment the last line of `scripts/backup.sh`.
3. **Hostinger snapshot:** hPanel → VPS → Snapshots & Backups. Take a manual snapshot before every update. Hostinger's automatic VPS backups are a useful extra, but don't rely on them alone.

Restore test (do this once, so you know it works):
```bash
docker compose exec -T postgres pg_restore -U tracking -d tracking --clean --if-exists < /var/backups/tracking/postgres-YYYYMMDD-HHMM.dump
```

## 8. Monitoring

- **UptimeRobot** (free): monitor `https://trk.yourbrand.in/healthz` every 5 minutes, with alerts by email/Telegram. If this is down, you are losing clicks and money.
- hPanel → VPS → Overview shows CPU, RAM and disk graphs. Upgrade the plan when they stay high.
- Logs: `docker compose logs -f tracker worker` (log files are size-limited automatically).

## 9. Optional: Cloudflare in front

Cloudflare (free) adds DDoS protection and gives the tracker each visitor's **country**, which geo-targeting needs later. To enable it:

1. Move the domain's nameservers to Cloudflare, and re-create all DNS records there, including `@`/`www` for the shared hosting.
2. Turn on the **orange cloud** for `trk` and `admin`. In SSL/TLS, set mode to **Full (strict)**.
3. **Delete the two `request_header -CF-...` lines** in `deploy/Caddyfile`, then `docker compose restart caddy`.

Skip step 3 and every click shows Cloudflare's IP and no country. Do step 3 without the orange cloud and visitors could fake their IP. Do both or neither.

## 10. Updating to a new version

From your PC: build the tarball and `scp` it as in step 4. On the server:

```bash
cd /opt/tracking
/opt/tracking/scripts/backup.sh                      # always back up first
tar -xzf /opt/tracking.tgz -C /opt/tracking && rm /opt/tracking.tgz
docker compose up -d --build                         # migrations run automatically
```

The tracker restarts in a few seconds. During that gap, clicks fail and advertisers' postbacks get errors. Most advertiser systems retry, but schedule updates for low-traffic hours (e.g. 3–5 AM IST).

## 11. Moving brands from the rented tracker

See [ROADMAP.md](ROADMAP.md), Months 5–6. Short version: the rented platform stays on its own subdomain (e.g. `go.yourbrand.in`, a CNAME set in the same DNS screen), and `trk.yourbrand.in` is this VPS. Move one brand at a time: run both in parallel, compare the numbers, then give that brand's publishers their new links.

## Monthly cost (approx.)

| Item | Note |
|---|---|
| Hostinger KVM 2 | Main cost; cheapest on 12–24 month terms |
| Existing Web Hosting | Already paid; keeps the marketing site |
| Domain | Already owned |
| Cloudflare, UptimeRobot, Let's Encrypt | Free |
| Backblaze B2 backups | A few rupees per GB per month |
