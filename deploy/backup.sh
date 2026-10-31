#!/usr/bin/env bash
# Nightly database backup with 14-day retention. Install with: crontab -e  ->  30 2 * * * /opt/blessly/deploy/backup.sh
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
DEST="${BACKUP_DIR:-/var/backups/blessly}"
mkdir -p "$DEST"
STAMP=$(date +%Y%m%d-%H%M)
docker compose exec -T db pg_dump -U "${POSTGRES_USER:-blessly}" -d "${POSTGRES_DB:-blessly}" --format=custom --no-owner > "$DEST/blessly-$STAMP.dump"
chmod 600 "$DEST/blessly-$STAMP.dump"
find "$DEST" -name 'blessly-*.dump' -mtime +14 -delete
echo "Backup written: $DEST/blessly-$STAMP.dump"
