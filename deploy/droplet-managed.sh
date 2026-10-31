#!/usr/bin/env bash
# Start Blessly on this droplet using DATABASE_URL from the environment or from .env.
# Does not print secret values. Does not start a local Postgres.
# Usage (on the droplet, from the project root, as root):
#   DOMAIN=blessly.co ACME_EMAIL=you@blessly.co APP_URL=https://blessly.co DATABASE_URL='postgresql://...' bash deploy/droplet-managed.sh
set -euo pipefail
cd "$(dirname "$0")/.."

set_env() {
  python3 - "$1" "$2" <<'PY'
import pathlib, sys
key, value = sys.argv[1], sys.argv[2]
path = pathlib.Path(".env")
lines = path.read_text().splitlines() if path.exists() else []
out, found = [], False
for line in lines:
    if line.startswith(key + "="):
        out.append(key + "=" + value)
        found = True
    else:
        out.append(line)
if not found:
    out.append(key + "=" + value)
path.write_text("\n".join(out) + "\n")
PY
}

if [[ ! -f .env ]]; then
  umask 077
  cp .env.example .env
  set_env POSTGRES_PASSWORD "$(openssl rand -hex 24)"
  set_env ENCRYPTION_KEY "$(openssl rand -base64 32 | tr -d '\n')"
  set_env CRON_SECRET "$(openssl rand -hex 24)"
  set_env MEDIA_SIGNING_SECRET "$(openssl rand -hex 24)"
  echo "Created .env. Copy ENCRYPTION_KEY into a password manager. It is not printed here."
fi
if [[ -n "${DATABASE_URL:-}" ]]; then
  set_env DATABASE_URL "$DATABASE_URL"
fi
if [[ -n "${APP_URL:-}" ]]; then
  set_env APP_URL "$APP_URL"
fi
if [[ -n "${DOMAIN:-}" ]]; then
  set_env DOMAIN "$DOMAIN"
fi
if [[ -n "${ACME_EMAIL:-}" ]]; then
  set_env ACME_EMAIL "$ACME_EMAIL"
fi
if ! grep -q '^DATABASE_URL=.\+' .env; then
  echo "DATABASE_URL is missing. Pass it in the environment." >&2
  exit 1
fi
if ! grep -q '^APP_URL=.\+' .env; then
  echo "APP_URL is missing. Pass it in the environment (https://your-host)." >&2
  exit 1
fi
if ! grep -q '^DOMAIN=.\+' .env; then
  echo "DOMAIN is missing. Pass the bare domain (example: blessly.co)." >&2
  exit 1
fi
if ! grep -q '^ACME_EMAIL=.\+' .env; then
  echo "ACME_EMAIL is missing. Let's Encrypt uses it for expiry notices." >&2
  exit 1
fi

docker compose -f docker-compose.managed.yml up -d --build
echo "Started. Check: docker compose -f docker-compose.managed.yml ps"
echo "Health: curl -kfsS \"\${APP_URL}/api/health\" || curl -kfsS https://127.0.0.1/api/health"
