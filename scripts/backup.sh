#!/usr/bin/env bash
# Nightly Postgres backup. Postgres holds all money data, so this matters most.
# Install on the server:  crontab -e  then add
#   30 2 * * * /opt/tracking/scripts/backup.sh >> /var/log/tracking-backup.log 2>&1
set -euo pipefail

cd "$(dirname "$0")/.."
DIR="${BACKUP_DIR:-/var/backups/tracking}"
KEEP_DAYS="${KEEP_DAYS:-14}"
mkdir -p "$DIR"

TS="$(date +%Y%m%d-%H%M)"
OUT="$DIR/postgres-$TS.dump"
docker compose exec -T postgres pg_dump -U tracking -d tracking -Fc > "$OUT.tmp"
mv "$OUT.tmp" "$OUT"
find "$DIR" -name 'postgres-*.dump' -mtime +"$KEEP_DAYS" -delete
echo "$(date -Is) backup ok: $OUT ($(du -h "$OUT" | cut -f1))"

# A backup on the same server is lost with the server. Copy it elsewhere,
# e.g. after `rclone config` for Backblaze B2 / Google Drive:
# rclone copy "$DIR" remote:tracking-backups --max-age 48h
