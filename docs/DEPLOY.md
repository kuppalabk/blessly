# Deploying Blessly on a DigitalOcean droplet

This is one server running Docker Compose: Caddy (HTTPS), the web app, the job worker and PostgreSQL.
Only ports 80 and 443 are open. Photos are stored on the server disk unless you add an S3-compatible
bucket in the admin Integrations page.

## What you need before starting
1. A domain (for example `blessly.app`) whose DNS **A record** points to the droplet's IP address.
2. A droplet: Ubuntu 24.04, at least 2 GB RAM, with SSH access for your user.
3. Your SSH public key added to the droplet. Send only the **public** key; never paste a private key into chat or email.
4. Keys for the services you use (Resend, Anthropic, Stripe or Razorpay, Google, Apple, Twilio, S3). These can be added after launch in the admin **Integrations** page.

## Steps
1. Copy the project to the droplet (from your computer, not the server):
   `rsync -av --exclude node_modules --exclude .next --exclude .env --exclude .env.local ./ you@DROPLET_IP:/opt/blessly/`
2. On the droplet:
   `cd /opt/blessly && sudo bash deploy/setup-droplet.sh blessly.app you@example.com`
   This installs Docker, opens only SSH/80/443, turns on fail2ban and automatic security updates, creates `.env` with generated secrets, and starts everything.
3. Make yourself the first admin:
   `docker compose exec web npm run admin -- grant you@example.com`
4. Open `https://your-domain`, sign up with that email, and turn on two-step verification (admins need it).
5. Open **Admin → Integrations**, paste each key, and press **Test connection** on each group.
6. Schedule backups: `crontab -e` and add `30 2 * * * /opt/blessly/deploy/backup.sh`.
7. Test one real sign-up, one reminder, and one payment in test mode before going live.

## Things to keep safe
- **`.env` holds `ENCRYPTION_KEY`.** Saved keys are encrypted with it. If you lose it, the saved keys cannot be read and must be entered again. Copy `.env` to a password manager.
- Keep **`MONEY_FEATURES`**, **`BILLING_TEST_MODE`** and **`SMS_DEV_CODES`** off in production unless you intend to use them.
- Turn **Legal approved** on only after a lawyer has reviewed `/privacy` and `/terms`.
- Restore a backup: `docker compose exec -T db pg_restore -U blessly -d blessly --clean < /var/backups/blessly/<file>.dump`.

## Updating
```
cd /opt/blessly && git pull   # or copy the new files
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```
The migration service runs before the web app starts, so schema changes apply automatically.

## Checks
- `curl -s https://your-domain/api/health` returns OK.
- `docker compose ps` shows db, web, worker and caddy running.
- Admin → System shows the job runner as recent.

## Photo storage on DigitalOcean Spaces (recommended)

By default photos are stored on the droplet's disk. Spaces keeps them safe if the droplet is rebuilt.

1. In the DigitalOcean control panel, create a Space in the region nearest your users (for example `sgp1`). Keep it **private**.
2. Create a Spaces access key (API → Spaces Keys). Save the key and secret somewhere secure. The secret is shown once.
3. Put these values in `/opt/blessly/.env` (or enter them in Admin → Integrations after first login):
   ```
   S3_ENDPOINT=https://sgp1.digitaloceanspaces.com
   S3_REGION=sgp1
   S3_BUCKET=your-space-name
   S3_ACCESS_KEY_ID=...
   S3_SECRET_ACCESS_KEY=...
   ```
4. Restart the app: `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`
5. Upload a test photo, then check it appears in the Space. Delete the test photo.

Photos written to the local disk before switching are not moved automatically.
Photo links are signed, so the Space itself does not need to be public.

## Troubleshooting

| Symptom | Likely cause and fix |
| --- | --- |
| Caddy says it could not get a certificate | DNS does not point to the droplet yet, or ports 80/443 are blocked. Fix DNS or the firewall, then `docker compose ... restart caddy`. |
| Web container unhealthy | `docker compose ... logs web`. Usually a missing or wrong value in `.env` (for example `ENCRYPTION_KEY` not valid base64 32 bytes). |
| Migrations fail | `docker compose ... logs migrate`. Check `POSTGRES_PASSWORD` matches the database. |
| "Something went wrong" on sign-up | Check `docker compose ... logs web`. Check the database is healthy. |
| Email not sent | Add the Resend key in Admin → Integrations and press Test connection. |
| Photos fail to upload | Check the Space keys and endpoint, then Test connection under Storage. |
| "npm ci" fails during the image build | Re-run with `docker compose -f docker-compose.yml -f docker-compose.prod.yml build --no-cache`. Only set `HTTP_PROXY`/`HTTPS_PROXY` if the server needs a proxy. |
| Saved integration keys stopped working after a restore | `ENCRYPTION_KEY` in `.env` must be the same key that was used when they were saved. |

## Droplet with a managed Postgres

Use this when the database is DigitalOcean managed Postgres (or any other external Postgres) instead of the Postgres container in `docker-compose.yml`. The local-database stack is unchanged.

1. Copy the project to the droplet, excluding `node_modules`, `.next`, and `.env`.
2. On the droplet, with `DATABASE_URL` set to the managed connection string (include `sslmode=require`):
   `DOMAIN=blessly.co ACME_EMAIL=you@blessly.co APP_URL=https://blessly.co bash deploy/droplet-managed.sh`
3. That file writes secrets into `.env` if they are not there, then runs `docker compose -f docker-compose.managed.yml up -d --build`. Caddy requests a Let's Encrypt certificate for the domain and for `www`, redirects `www` to the bare domain, and renews the certificate automatically. Ports 80 and 443 must reach the droplet, and both names must point at it.
4. Add this droplet's public IP to the database trusted sources, or the app cannot connect.
5. Without a domain, Caddy serves HTTPS with a local certificate and browsers show a warning. Point a domain at the droplet and switch to `docker-compose.prod.yml` plus `deploy/Caddyfile` when you want a public certificate. Do not put the database password in git.

## DigitalOcean App Platform

Use this when you want DigitalOcean to build the Docker image from GitHub and run it, instead of a droplet.

The spec is `.do/app.yaml`. It runs three components from the same Dockerfile, in region `lon`:

- `web` listens on port 3000 (the image's `PORT`) and is checked at `/api/health`.
- `migrate` runs `npm run db:migrate` before each deploy.
- `jobs` runs `npm run jobs` (reminders and scheduled sends).
- `db` is an App Platform development Postgres 16. It is not a production database cluster.

`DATABASE_URL` is the attached database. Managed Postgres uses `sslmode=require`; the app adds `uselibpqcompat=true` for that URL only, so the droplet's non-TLS database URL is unchanged. `APP_URL` is the web service's public URL.

Create a DigitalOcean personal access token, then from a checkout of this repo:

```bash
export DIGITALOCEAN_ACCESS_TOKEN=...   # do not commit this
bash deploy/app-platform.sh            # deploys the current git branch
```

The script writes `.do/secrets.env` (mode 600, gitignored) with `CRON_SECRET`, `ENCRYPTION_KEY` and `MEDIA_SIGNING_SECRET`, and stores them as encrypted app variables. Copy `ENCRYPTION_KEY` into a password manager. If you lose it, saved integration keys and two-step verification secrets cannot be read.

The first deploy builds the image on App Platform. Later pushes to the tracked branch redeploy when the repo is connected with GitHub. If DigitalOcean cannot see the GitHub repo, the script falls back to the public clone URL; that path does not redeploy on push until you connect GitHub and point the app at `.do/app.yaml`.

Container sizes in the spec are 1 vCPU / 1 GB for the web service and the worker (`apps-s-1vcpu-1gb-fixed`, $10 each per month) plus the development database ($7 per month). The migrate job is billed only while it runs. Photos on the container disk disappear when the container is replaced — add a Space under Admin → Integrations (see below) before real uploads.

To move the database to a production cluster later, create the cluster, set `production: true` and `cluster_name` in `.do/app.yaml`, and run the script again. Do that before launch traffic.

## Files in this package

- `docs/DEPLOY.md` — this guide.
- `deploy/setup-droplet.sh` — first-time server setup.
- `deploy/app-platform.sh` — create or update the App Platform app.
- `.do/app.yaml` — App Platform spec (web, worker, migrate job, development Postgres).
- `deploy/backup.sh` — nightly database backup.
- `deploy/Caddyfile` — HTTPS and reverse proxy.
- `docker-compose.yml`, `docker-compose.prod.yml`, `docker-compose.override.yml` — containers (the override is for local use only).
- `Dockerfile` — builds the app image.
- `.env.example` — every setting, with no values. Copy to `.env` on the server.

The package does not contain `.env`, `.env.local`, any keys, `node_modules`, or uploaded files.
