# Launching Blessly — the steps that need your accounts

Everything in the code is built and tested. These steps need accounts, payments, domains or people that only you can provide. Work top to bottom; each step says how to check it worked. Settings go into your host's **environment variables** (see `.env.example` for the full list).

---

## 1. Put the code in GitHub (10 minutes)

1. Create a **private** repository on github.com (e.g. `wishwell`), without a README.
2. In the unzipped folder:
   ```bash
   git remote add origin https://github.com/<you>/wishwell.git
   git push -u origin main
   ```
3. Check: the **Actions** tab runs CI (type check, 130+ tests, build, browser tests) and goes green.

Tip: in claude.ai **Settings → Connectors**, connect GitHub so Claude can work on the repository directly next time.

## 2. Host the app (30–60 minutes)

**Option A — Render (simplest):** New → **Blueprint** → choose the repository. It creates the database, the web service and the job worker from `render.yaml`. Fill in the values marked "sync: false" as you complete the steps below (start with `APP_URL`, `ENCRYPTION_KEY`).

**Option B — any server with Docker:** copy `.env.example` to `.env`, fill it in, then `docker compose up -d --build`.

**Option C — Vercel / Railway / Fly.io + Neon/Supabase Postgres:** run `npm run db:migrate` on each release, run the web app, and either run `npm run jobs` as a worker or call `POST /api/cron` every minute with `Authorization: Bearer $CRON_SECRET`.

Required settings:
| Setting | Value |
|---|---|
| `APP_URL` | Your public address, e.g. `https://blessly.app` (https!) |
| `DATABASE_URL` | From your database provider |
| `CRON_SECRET` | 32+ random characters |
| `ENCRYPTION_KEY` | `openssl rand -base64 32` — keep a safe copy; losing it disconnects businesses' WhatsApp |
| `MEDIA_SIGNING_SECRET` | 32+ random characters |
| `RATE_LIMIT_STORE` | `postgres` (default in production) |

Point your **domain** at the host and turn on HTTPS. Check: `https://<your domain>/api/health` shows `{"ok":true}`, and **Platform admin → System** says "All systems normal" after a minute.

Then make yourself an admin: sign up in the app, then run `npm run admin -- grant you@example.com` on the server (Render: Shell tab).

## 3. Email — Resend (20 minutes + DNS wait)

1. Create an account at resend.com, add your domain and add the DNS records it shows (SPF, DKIM). Wait for "Verified".
2. Set `RESEND_API_KEY` and `EMAIL_FROM="Blessly <wishes@your-domain>"`.
3. Check: use "Forgot your password?" on your own account — the email arrives.

## 4. Photo storage — Cloudflare R2 or AWS S3 (15 minutes)

Needed when the web app and the worker run on different machines (Render, Vercel…).
1. Create a bucket (private). Create an access key with read/write to that bucket.
2. Set `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and for R2 `S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com`, `S3_REGION=auto`.
3. Check: create an album and add a photo.

## 5. AI wishes — Anthropic (5 minutes)

Create an API key at console.anthropic.com, set `ANTHROPIC_API_KEY` (and optionally `ANTHROPIC_MODEL`). Add a monthly spend limit in the console. Check: **Create** → "Write my wish" in Funny tone gives a new text each time.

## 6. Push notifications (5 minutes)

Run `npm run push:keys` once, set the three `VAPID_*` values. Then test on real devices:
- Android Chrome: Settings → Phone notifications → turn on → "Send a test notification".
- iPhone (iOS 16.4+): open the site in Safari → Share → **Add to Home Screen** → open from the icon → Settings → turn on.
- Desktop Chrome/Edge/Firefox.

## 7. Payments (1–2 hours, plus approval time)

**Razorpay (India, INR)** — needs a registered business and KYC.
1. Dashboard → Settings → API Keys → generate live keys → set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`. Enable **Subscriptions** (and UPI AutoPay) for your account.
2. Settings → Webhooks → add `https://<your domain>/api/webhooks/razorpay` with a secret (→ `RAZORPAY_WEBHOOK_SECRET`). Events: `subscription.authenticated`, `subscription.activated`, `subscription.charged`, `subscription.pending`, `subscription.halted`, `subscription.cancelled`, `subscription.completed`.
3. Plans are created automatically on first checkout; set prices in **Platform admin → Plans**.

**Stripe (everyone else, USD)**
1. Developers → API keys → set `STRIPE_SECRET_KEY`.
2. Developers → Webhooks → add `https://<your domain>/api/webhooks/stripe` (→ `STRIPE_WEBHOOK_SECRET`). Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.

Never set `BILLING_TEST_MODE` in production. Check: buy the Family plan with a real card/UPI for ₹99, see "You're on Family", then cancel it.

**Money features** (group gifts, fundraisers, gift cards, marketplace, printed cards) are off unless `MONEY_FEATURES=1`. Until the payment keys above are live they use test checkout only, so do not turn them on in production until live payments and the seller and partner terms are approved.

**Phone sign-in:** never set `SMS_DEV_CODES=1` in production — it shows sign-in codes on screen. Set the `TWILIO_*` variables instead.

Also: talk to an accountant about GST (India) / VAT (UK/EU) on subscriptions; Razorpay and Stripe can add tax to invoices.

## 8. WhatsApp for businesses — Meta (days to weeks: business verification)

1. Create a Meta Business account and complete **Business verification**.
2. developers.facebook.com → create an app (type *Business*) → add **WhatsApp**.
3. App settings → Basic → copy the **App secret** → `WHATSAPP_APP_SECRET`. Choose any long random **verify token** → `WHATSAPP_VERIFY_TOKEN`.
4. WhatsApp → Configuration → Webhook: callback `https://<your domain>/api/webhooks/whatsapp`, verify token as above → **Verify and save** → subscribe to the **messages** field.
5. Test with your own number: in Blessly **Business → Settings**, paste the Phone number ID, WhatsApp Business Account ID and a permanent System User token. Create and get approval for a template such as *"Happy birthday {{1}}! Enjoy a treat on us at {{2}}."* (category Marketing), press **Refresh templates**, switch on Birthday wishes, add yourself as a customer with today's birthday and consent, and wait for the send hour.
6. For other businesses to connect with a few clicks (instead of pasting IDs), apply to become a **Meta Tech Provider** and add *Embedded Signup* (a later enhancement).

## 9. Legal (with a lawyer)

1. Have a lawyer review **/privacy** and **/terms** (drafts written for the UK GDPR and India's DPDP Act 2023), plus your company details.
2. Set `LEGAL_COMPANY_NAME`, `LEGAL_ADDRESS`, `SUPPORT_EMAIL`, `GRIEVANCE_OFFICER` (name and email — required in India), then `LEGAL_APPROVED=1` to remove the "Draft" banner.
3. If you serve EU/UK users, register with the ICO (UK) and keep a record of processing; sign the data processing agreements offered by Resend, Anthropic, Stripe/Razorpay, Meta and your host.

## 10. Translations

The interface is in 32 languages. Each language's dictionary is `src/locales/<code>.json`, built from the translator files in `src/locales/_tx/` by `npx tsx scripts/i18n/build.ts <code>`. These were written by AI and checked automatically for placeholders and completeness; **no native speaker has reviewed them yet.** Ask native speakers to review each language file, especially **Konkani, Maithili, Assamese** and the right-to-left languages (Arabic, Urdu, Persian). Changes are plain text edits, then rebuild.

Not translated on purpose: the legal pages, the platform admin area, and the card greeting text. Emails and push notifications are still English.

Greeting and wish templates live in `src/lib/i18n-data.ts` (greetings) and `src/lib/wishes/templates.ts` (closing lines); they need the same native review.

## 11. Festival dates

Lunar dates are set through 2028 (checked October 2026). Each autumn, open **Platform admin → Content**: it lists any festival missing a date for the next two years. Islamic dates can move by a day after moon sighting — correct them there; users see the change within a minute.

## 12. App stores (optional)

The web app installs from the browser already. To be listed in stores:
- **Google Play:** at pwabuilder.com enter your domain → Android → download the package (Trusted Web Activity). Create a Play Console account ($25), upload it, then copy the app signing SHA-256 fingerprint and set `ANDROID_PACKAGE` and `ANDROID_SHA256_FINGERPRINTS` so `/.well-known/assetlinks.json` verifies the app (removes the browser bar).
- **Apple App Store:** PWABuilder → iOS also produces a project, but Apple often rejects simple web wrappers; plan for review feedback or a native shell later. An Apple Developer account costs $99/year.

## 13. Security check before a big launch

The app has a built-in security review behind it (access checks on every route, CSRF protection, Content-Security-Policy, signed links, encrypted credentials, rate limits, upload size caps, audited admin actions). Before you spend on marketing, commission an independent **penetration test** (CREST/OSCP-certified tester), and set up uptime monitoring on `/api/health` and error alerts from your host.

Two known items to schedule:
- `next` uses an older bundled `postcss` flagged by `npm audit` (build-time only, not reachable by users). It's fixed in Next.js 16 — upgrade when convenient and run the tests.
- `clientIp()` trusts the first `X-Forwarded-For` address. That's right behind Render, Vercel and most load balancers; if you put Blessly directly on the internet without a proxy, change it to use the socket address.
