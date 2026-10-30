# Blessly — personal wishes, Family Circle, albums, Business and Platform admin (PWA)

**Launching?** Follow [docs/LAUNCH.md](docs/LAUNCH.md) — the steps that need your own accounts (hosting, email, payments, WhatsApp, legal, app stores).

Reminders, AI-written wishes in 32 languages and 250 card designs per occasion, with one-tap sending to WhatsApp, Telegram, SMS and email, and shareable wish pages that friends can sign.

## What's built

| Area | Status |
|---|---|
| Accounts (email + password, 30-day sessions) | ✅ |
| People with birthdays, anniversaries, work anniversaries and custom dates | ✅ |
| Smart reminders: gift (7 days before), ideas (3 days), wish draft (1 day, 6pm), send day (9am), in the user's timezone | ✅ |
| Festival calendar (India, UK, US, UAE, global) | ✅ lunar dates confirmed through 2028; Easter and Thanksgiving calculated; admins can add years |
| Wish writer: 40 occasions × 32 languages × 4 tones (24 occasions added: engagement, baby shower, Mother’s/Father’s Day, Valentine’s, housewarming, retirement, Halloween, Hanukkah, Vaisakhi, Vesak, Ramadan, pets…) | ✅ templates built in; AI when `ANTHROPIC_API_KEY` is set |
| Card designs: 250 per occasion, 32 original artworks | ✅ |
| Send now: WhatsApp / Telegram / SMS / email deep links; Facebook, LinkedIn and X share the wish page; the phone's share sheet reaches Instagram and other apps | ✅ opens the user's own app |
| Scheduled sends: email sent automatically; chat apps get a "send now" nudge | ✅ |
| Public wish page with guest messages (no account needed) | ✅ |
| Alerts inbox, calendar view, settings | ✅ |
| PWA: installable, offline page, cached artwork | ✅ |
| **Phase 2 — Family Circle:** circles of up to 6 people, invite by link (WhatsApp share), roles (owner, admin, member, can view) | ✅ |
| Share a person with the circle: everyone sees them and gets their reminders, in their own timezone; everything else stays private | ✅ |
| Family events with RSVP (going / maybe / can't go), alerts the evening before and the morning of | ✅ |
| "Who's doing what" task board: assign, start, done; assignee is notified | ✅ |
| Group card per event: one wish page the family signs, with "3 of 6 signed" progress | ✅ |
| Family events on Home and Calendar | ✅ |
| **Phase 2 — Push notifications** (Web Push): reminders, event alerts, tasks and invites reach the phone even when the app is closed | ✅ when VAPID keys are set |
| **Phase 3 — Business:** a workspace per business owner: customers, consent records, CSV import (5,000 rows at a time) | ✅ |
| Automatic birthday and anniversary wishes at a chosen hour in the business's timezone — WhatsApp from the business's own number (official Cloud API, approved templates), falling back to email | ✅ |
| Festival/offer campaigns to everyone or a tag, scheduled; per-campaign sent/delivered/read counts | ✅ |
| Delivery ticks from Meta's signed webhook; customers who reply STOP are opted out (START opts back in); unsubscribe link in every email | ✅ |
| Monthly message allowance per plan (default 1,000), message log with reasons for anything not sent | ✅ |
| **Phase 4 — Platform admin:** dashboard (users, active users, sign-ups chart, circles, businesses, messages), user search and detail, suspend/restore, log out everywhere, permanent deletion with typed confirmation | ✅ |
| Businesses: monthly allowance, pause/resume sending (owner is told), usage | ✅ |
| System health: job runner history, overdue work, queue and failure counts, configuration checks; audit log of every admin action | ✅ |
| Accounts: forgot/reset password by email, download my data (JSON), delete my account (family circles pass to the next member) | ✅ |
| **Phase 5 — Photo albums:** 100 album designs, upload from phone or computer (resized, location data removed), share by link, guests add photos, family-shared albums | ✅ |
| **Phase 5 — Plans and billing:** Free / Family / Business, monthly or yearly, Razorpay (India, UPI AutoPay) and Stripe (USD), cancel at period end, grace period, admin price changes and free grants | ✅ test checkout built in; live keys needed |
| **Phase 5 — Business teams:** invite colleagues by email to share a business workspace | ✅ |
| **Phase 5 — Admin content:** feature/hide card designs, festival dates, announcements to all users | ✅ |
| Admin read-only "view as user" for support — audited, 30 minutes, user is told | ✅ |
| Privacy policy and terms of use (drafts for legal review), linked from sign-up and the footer | ✅ |
| **Celebrations:** invite-only parties with RSVP; guests post photos and updates; host sees it all on one page | ✅ |
| **Wishlists:** a friend reserves a gift without the owner seeing who reserved it, so the surprise is kept | ✅ |
| **Card editor:** design your own card — text, fonts, colours, stickers, photos, signature, QR code, voice or video message | ✅ |
| **Sign-in options:** Google and Apple sign-in, phone codes, two-step verification with authenticator apps and recovery codes; admins must use two-step verification | ✅ phone codes need Twilio, or `SMS_DEV_CODES=1` for testing |
| **Money (test mode):** group gifts and fundraisers, gift cards, a marketplace with seller approval, partner portals, printed cards | ✅ off unless `MONEY_FEATURES=1`; test checkout only until payment keys are set |
| **Interface in 32 languages:** every screen translated (English plus 31 others); right-to-left for Arabic, Urdu and Persian | ✅ machine-translated; native-speaker review needed |
| Docker image, docker-compose, Render blueprint, GitHub Actions CI, health check, Android app link file | ✅ |

**Why chat apps aren't fully automatic for individuals:** WhatsApp, Telegram, Instagram, Messenger and LinkedIn don't allow apps to send from a person's own account. Blessly writes the message and opens the user's app with it ready; the user taps send.

**How business WhatsApp works:** each business connects its own WhatsApp Business number (WhatsApp Business Platform, Cloud API). Messages that start a conversation must use a template Meta has approved (birthday wishes and offers are the *marketing* category). Meta charges the business's WhatsApp account per delivered message; Blessly's allowance only counts messages. Businesses may only message customers who opted in — Blessly records consent for every customer and sends nothing without it.

## Run it locally

Requires Node 20+ and PostgreSQL 14+.

```bash
npm install
cp .env.example .env.local          # then edit DATABASE_URL and CRON_SECRET
createdb wishwell
npm run db:migrate
npm run db:seed                     # optional demo logins: demo@blessly.local (platform admin, with a family circle and a demo bakery) and aarav@blessly.local / demo-password
npm run dev                         # http://localhost:3000
npm run jobs                        # in a second terminal: reminders and scheduled sends, every minute
```

## Tests

```bash
createdb wishwell_test
DATABASE_URL=postgres://…/wishwell_test npm run db:migrate
npm test             # 162 unit + integration tests (uses TEST_DATABASE_URL or the local wishwell_test database)
npm run build && npm run test:e2e   # 33 browser tests (starts a local stand-in for Meta's WhatsApp API) on a phone viewport and desktop (Playwright)
```

What the tests cover:
- **Dates and reminders:** next occurrence, 29 February, timezones, daylight-saving changes, which stages fire, idempotent planning.
- **Job runner:** reminders delivered once, scheduled email sent once even with three overlapping runners, retry with backoff then give up after 3 attempts.
- **Wishes:** every occasion × language × tone produces text; AI provider used when available and falls back on failure; sympathy messages are never jokey.
- **Security:** other users' people and wishes return 404, cross-site POSTs are blocked, unauthenticated calls get 401, the cron endpoint needs its secret, input validation errors.
- **Family Circle:** invite links (expired, cancelled, malformed), the 6-person limit holds when four people join at once, roles and permissions (viewers, admins, owner hand-over, leaving), non-members get 404, shared-person reminders go to each opted-in member once in their own timezone, private people stay private, RSVPs, tasks, one group card even when two people start it at the same moment, event alerts sent once with overlapping runners.
- **Push:** subscriptions saved and moved between accounts, each alert pushed once to every device even with three runners, stale alerts not pushed, dead subscriptions removed.
- **Business:** Cloud API request format and Meta error handling (opted out, rate limits, temporary errors), token encrypted at rest and never returned to the browser, webhook signature check, statuses only move forward, STOP/START, CSV parsing (quotes, BOM, semicolons, day-first dates) and import with row-by-row reasons, one wish per customer per day even with three overlapping runners, 29 February birthdays, email fallback, retries then failure, monthly limit, campaigns by tag sent once, cancelled campaigns never sent, unsubscribe links.
- **Admin and accounts:** only admins reach the admin area (others get "not found"), suspension ends sessions/blocks login/cancels sends/pauses the business and is reversible, admins can't act on themselves or other admins, every action is audited, paused businesses send nothing, job runs recorded, reset links work once within an hour and log out other devices, export has no secrets, account deletion keeps family circles alive.
- **Albums, plans, teams:** uploads re-encoded with metadata removed, signed photo links (forged links refused), guest uploads only when allowed, non-images refused, plan limits, checkout success/failure, cancel at period end, webhooks verified, free grants, staff invites.
- **Security:** read-only support view blocks every change and data download, shared rate-limit counters stay exact under concurrent hits, request bodies capped while streaming, pages load with the Content-Security-Policy and no violations.
- **Browser journeys:** sign up / log in / log out, add a person, write a wish in Hindi, pick design 17, send links contain the phone number and wish page link, schedule and cancel, a guest signs the wish page, edit and delete a person, a relative opens an invite link logged out, signs up and joins, sees the shared birthday read-only, RSVPs, picks up a task and signs the group card, viewers can't add events, reminder alert appears after the job runs, no horizontal scrolling on phone and desktop, Arabic shown right-to-left, PWA manifest and service worker.

## Platform admins

Admin rights are only granted from the command line, never from inside the app:

```bash
npm run admin -- grant you@example.com    # the person must have signed up first
npm run admin -- revoke you@example.com
npm run admin -- list
```

Admins see a "Platform admin" link in the menu (Settings on phones). For privacy, admins see counts — not people's contacts or messages. Admin accounts can't be suspended or deleted from the admin screens.

## Deploy

Any Node host works (Vercel, Render, Railway, Fly.io, a VM) with a managed PostgreSQL (Neon, Supabase, RDS…). DigitalOcean App Platform: see [docs/DEPLOY.md](docs/DEPLOY.md) and run `bash deploy/app-platform.sh`.

1. Set environment variables from `.env.example`. `APP_URL` must be the public https address.
2. Run `npm run db:migrate` once per release.
3. Schedule reminders and sends, either:
   - call `POST /api/cron` every minute with header `Authorization: Bearer $CRON_SECRET` (e.g. Vercel Cron, a GitHub Action, or cron-job.org), or
   - run `npm run jobs` as an always-on worker process.
   Running both, or several workers, is safe: rows are locked so nothing is delivered twice.

### Optional providers
| Variable | What it switches on | Without it |
|---|---|---|
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | AI-written wishes in every tone and language | Built-in templates (all languages, tone variety in English) |
| `RESEND_API_KEY`, `EMAIL_FROM` | Real email delivery for reminders and scheduled wishes | Emails are recorded in the `outbox` table only |
| `ENCRYPTION_KEY` | Required for Business WhatsApp: encrypts each business's access token (`openssl rand -base64 32`). Keep it safe — losing it means businesses must reconnect | Businesses can't connect WhatsApp |
| `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | Delivery ticks and STOP replies: the Meta app's secret (checks webhook signatures) and the token you type when adding the webhook URL `https://<APP_URL>/api/webhooks/whatsapp` in the Meta app | Messages still send; statuses stay at "Sent" |
| `WHATSAPP_GRAPH_VERSION` | Graph API version (default `v23.0`) | — |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Phone and browser push notifications. Create once with `npm run push:keys`; changing them later signs every device out of push | Alerts in the app and by email only |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | "Continue with Google" sign-in | Google button hidden |
| `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` | "Continue with Apple" sign-in | Apple button hidden |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | Text-message sign-in codes | Phone sign-in hidden in production (`SMS_DEV_CODES=1` shows codes on screen for testing only) |
| `MONEY_FEATURES=1` | Group gifts, fundraisers, gift cards, marketplace, printed cards | Hidden |
| `BILLING_TEST_MODE=1` | Test checkout for plans and money features | Never set in production |

## Before launch — what still needs you

Step-by-step instructions are in [docs/LAUNCH.md](docs/LAUNCH.md).
- [ ] Hosting: follow [docs/DEPLOY.md](docs/DEPLOY.md) for the droplet (Docker Compose, Caddy HTTPS, backups) with a managed or local PostgreSQL and your domain.
- [ ] Live keys: Resend (email), Anthropic (AI), Razorpay and Stripe (payments), S3/R2 (photos), VAPID (push).
- [ ] Meta: business verification, Blessly's Meta app and webhook, one real approved template tested end to end; later, Tech Provider + Embedded Signup.
- [ ] Push tested on a real Android phone, desktop browsers and an iPhone with Blessly on the Home Screen.
- [ ] Lawyer review of /privacy and /terms (drafted for UK GDPR and India's DPDP Act), company details and grievance officer, then `LEGAL_APPROVED=1`.
- [ ] Native-speaker review of all 31 non-English interface languages (machine-translated; see docs/LAUNCH.md §10), especially Konkani, Maithili and Assamese.
- [ ] Each autumn: festival dates for the year after next (Platform admin → Content lists what's missing).
- [ ] Optional: Play Store listing via PWABuilder (set `ANDROID_PACKAGE`, `ANDROID_SHA256_FINGERPRINTS`); App Store needs an Apple developer account.
- [ ] Independent penetration test (an internal security review is done — see docs/LAUNCH.md §13).

## Project layout
```
src/lib/            pure logic: dates, reminders, festivals, wishes, cards, send links, 32-language data
src/locales/        interface dictionaries, one `<code>.json` per language; translator sources in `_src/` and `_tx/`; built with `npx tsx scripts/i18n/build.ts`
src/server/         database schema, services (auth, account, admin, people, wishes, family, push, albums, billing, content, business, bizjobs, jobs, home), email, push, WhatsApp, payment and storage providers
src/app/api/        REST endpoints (thin wrappers over services)
src/app/(app)/      logged-in screens: home, people, create, wishes, family (circle, events, join), albums, plans, business (overview, customers, automations, campaigns, messages, settings, team), calendar, alerts, settings
src/app/(app)/admin  platform admin: overview, users, businesses, system, audit log
src/app/u/[token]   public unsubscribe page for business customers
src/app/forgot, src/app/reset/[token]   password reset
src/app/w/[slug]    public wish page
src/app/cards       public card library
tests/              Vitest unit + integration tests
e2e/                Playwright browser tests
public/art          32 original card artworks; public/sw.js service worker
```
