#!/usr/bin/env bash
# First-time setup for a fresh Ubuntu 24.04 droplet. Run as root from inside the copied project folder:
#   sudo bash deploy/setup-droplet.sh blessly.app you@example.com
# Installs Docker, opens only SSH/80/443, enables automatic security updates and fail2ban,
# and creates .env with generated secrets (printed nowhere; they stay in .env).
set -euo pipefail
DOMAIN="${1:?Usage: setup-droplet.sh <domain> <admin email for certificates>}"
ADMIN_EMAIL="${2:?Usage: setup-droplet.sh <domain> <admin email>}"
cd "$(dirname "$0")/.."

apt-get update -y
apt-get install -y ca-certificates curl ufw fail2ban unattended-upgrades docker.io docker-compose-v2 openssl
systemctl enable --now docker

ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
systemctl enable --now fail2ban
dpkg-reconfigure -f noninteractive unattended-upgrades || true

if [ ! -f .env ]; then
  umask 077
  cp .env.example .env
  set_env() { sed -i "s|^$1=.*|$1=$2|" .env; }
  set_env POSTGRES_PASSWORD "$(openssl rand -hex 24)"
  set_env ENCRYPTION_KEY "$(openssl rand -base64 32)"
  set_env CRON_SECRET "$(openssl rand -hex 24)"
  set_env MEDIA_SIGNING_SECRET "$(openssl rand -hex 24)"
  set_env APP_URL "https://$DOMAIN"
  grep -q '^DOMAIN=' .env || echo "DOMAIN=$DOMAIN" >> .env
  sed -i "s|^DOMAIN=.*|DOMAIN=$DOMAIN|" .env
  sed -i "s|^BILLING_TEST_MODE=.*|BILLING_TEST_MODE=|; s|^SMS_DEV_CODES=.*|SMS_DEV_CODES=|; s|^MONEY_FEATURES=.*|MONEY_FEATURES=|" .env
  echo "Created .env with generated secrets. Add the rest (keys) in the admin Integrations page after first login."
else
  echo ".env already exists; left unchanged."
fi
# Tell Caddy which address to use; the certificate contact is only used by Let's Encrypt.
grep -q '^ACME_EMAIL=' .env || echo "ACME_EMAIL=$ADMIN_EMAIL" >> .env

mkdir -p /var/backups/blessly
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
echo "Done. Create the first admin: docker compose exec web npm run admin -- grant you@example.com"
echo "Then open https://$DOMAIN/login, turn on two-step verification, and add keys at /admin/integrations."
