import { sql, eq } from 'drizzle-orm';
import { getDb } from './db';
import { decrypt, encrypt } from './crypto';
import { AppError } from './errors';
import { adminAudit, appSettings } from './schema';

export type Group = 'email' | 'ai' | 'stripe' | 'razorpay' | 'whatsapp' | 'push' | 'storage' | 'sms' | 'google' | 'apple' | 'legal' | 'features' | 'android' | 'sign-in' | 'security';

export type SettingDef = {
  key: string;
  group: Group;
  label: string;
  /** Hidden in the admin list after saving (shown as ●●●● last 4 characters). */
  secret: boolean;
  /** Pasted or uploaded file contents (for example a .p8 private key). Shown as a size only. */
  file?: boolean;
  help: string;
};

/**
 * Every key the Platform admin can set. The database value wins; the environment variable of the
 * same name is the fallback, so existing deployments keep working.
 */
export const SETTINGS: SettingDef[] = [
  { key: 'RESEND_API_KEY', group: 'email', label: 'Resend API key', secret: true, help: 'Sends reminders and scheduled wishes by email.' },
  { key: 'EMAIL_FROM', group: 'email', label: 'From address', secret: false, help: 'For example Blessly <hello@blessly.app>. The domain must be verified in Resend.' },
  { key: 'ANTHROPIC_API_KEY', group: 'ai', label: 'Anthropic API key', secret: true, help: 'AI-written wishes. Without it, built-in templates are used.' },
  { key: 'ANTHROPIC_MODEL', group: 'ai', label: 'Model name', secret: false, help: 'Leave empty to use the default model.' },
  { key: 'STRIPE_SECRET_KEY', group: 'stripe', label: 'Stripe secret key', secret: true, help: 'International payments in USD. Use a live key only when ready.' },
  { key: 'STRIPE_WEBHOOK_SECRET', group: 'stripe', label: 'Stripe webhook signing secret', secret: true, help: 'From the webhook endpoint in Stripe: https://<your domain>/api/webhooks/stripe' },
  { key: 'RAZORPAY_KEY_ID', group: 'razorpay', label: 'Razorpay key ID', secret: false, help: 'Payments in India (INR), including UPI AutoPay.' },
  { key: 'RAZORPAY_KEY_SECRET', group: 'razorpay', label: 'Razorpay key secret', secret: true, help: '' },
  { key: 'RAZORPAY_WEBHOOK_SECRET', group: 'razorpay', label: 'Razorpay webhook secret', secret: true, help: 'From https://<your domain>/api/webhooks/razorpay' },
  { key: 'WHATSAPP_APP_SECRET', group: 'whatsapp', label: 'Meta app secret', secret: true, help: 'Checks that webhook calls come from Meta.' },
  { key: 'WHATSAPP_VERIFY_TOKEN', group: 'whatsapp', label: 'Webhook verify token', secret: true, help: 'The token you type into Meta when adding the webhook.' },
  { key: 'WHATSAPP_GRAPH_VERSION', group: 'whatsapp', label: 'Graph API version', secret: false, help: 'For example v23.0. Leave empty for the default.' },
  { key: 'VAPID_PUBLIC_KEY', group: 'push', label: 'VAPID public key', secret: false, help: 'Phone and browser notifications. Generate with npm run push:keys.' },
  { key: 'VAPID_PRIVATE_KEY', group: 'push', label: 'VAPID private key', secret: true, help: 'Changing keys signs every device out of notifications.' },
  { key: 'VAPID_SUBJECT', group: 'push', label: 'VAPID subject', secret: false, help: 'For example mailto:hello@blessly.app' },
  { key: 'S3_ENDPOINT', group: 'storage', label: 'S3 endpoint', secret: false, help: 'Cloudflare R2 or DigitalOcean Spaces endpoint. Leave empty to store photos on the server disk.' },
  { key: 'S3_REGION', group: 'storage', label: 'S3 region', secret: false, help: 'For example auto (R2) or sgp1 (Spaces).' },
  { key: 'S3_BUCKET', group: 'storage', label: 'Bucket name', secret: false, help: '' },
  { key: 'S3_ACCESS_KEY_ID', group: 'storage', label: 'Access key ID', secret: true, help: '' },
  { key: 'S3_SECRET_ACCESS_KEY', group: 'storage', label: 'Secret access key', secret: true, help: '' },
  { key: 'TWILIO_ACCOUNT_SID', group: 'sms', label: 'Twilio account SID', secret: false, help: 'Text-message sign-in codes.' },
  { key: 'TWILIO_AUTH_TOKEN', group: 'sms', label: 'Twilio auth token', secret: true, help: '' },
  { key: 'TWILIO_FROM', group: 'sms', label: 'Sender number or name', secret: false, help: 'For example +15550001234' },
  { key: 'GOOGLE_CLIENT_ID', group: 'google', label: 'Google client ID', secret: false, help: 'Shows "Continue with Google". Redirect: https://<your domain>/api/auth/oauth/google/callback' },
  { key: 'GOOGLE_CLIENT_SECRET', group: 'google', label: 'Google client secret', secret: true, help: '' },
  { key: 'APPLE_CLIENT_ID', group: 'apple', label: 'Apple Services ID', secret: false, help: 'Shows "Continue with Apple".' },
  { key: 'APPLE_TEAM_ID', group: 'apple', label: 'Apple team ID', secret: false, help: '' },
  { key: 'APPLE_KEY_ID', group: 'apple', label: 'Apple key ID', secret: false, help: '' },
  { key: 'APPLE_PRIVATE_KEY', group: 'apple', label: 'Apple private key (.p8)', secret: true, file: true, help: 'Upload the .p8 file or paste its contents.' },
  { key: 'LEGAL_COMPANY_NAME', group: 'legal', label: 'Company name', secret: false, help: 'Shown on the privacy policy and terms.' },
  { key: 'LEGAL_ADDRESS', group: 'legal', label: 'Registered address', secret: false, help: '' },
  { key: 'SUPPORT_EMAIL', group: 'legal', label: 'Support email', secret: false, help: '' },
  { key: 'GRIEVANCE_OFFICER', group: 'legal', label: 'Grievance officer', secret: false, help: 'Name and email (required in India).' },
  { key: 'LEGAL_APPROVED', group: 'legal', label: 'Legal pages approved', secret: false, help: 'Set to 1 after a lawyer has reviewed /privacy and /terms. Removes the Draft banner.' },
  { key: 'MONEY_FEATURES', group: 'features', label: 'Money features (1 = on)', secret: false, help: 'Group gifts, fundraisers, gift cards, shop and printed cards.' },
  { key: 'BILLING_TEST_MODE', group: 'features', label: 'Test checkout (1 = on)', secret: false, help: 'Use test checkout instead of real payments. Turn off before taking real money.' },
  { key: 'ANDROID_PACKAGE', group: 'android', label: 'Android package name', secret: false, help: 'For the Android app link file.' },
  { key: 'ANDROID_SHA256_FINGERPRINTS', group: 'android', label: 'Android signing fingerprints', secret: false, help: 'Comma-separated, from Play Console.' },
  { key: 'MEDIA_SIGNING_SECRET', group: 'security', label: 'Photo link signing secret', secret: true, help: 'Optional. Falls back to ENCRYPTION_KEY when empty.' },
];

const DEFS = new Map(SETTINGS.map((s) => [s.key, s]));
export const settingDef = (key: string) => DEFS.get(key);

const TTL_MS = 30_000;
let snapshot = new Map<string, string>();
let loadedAt = 0;
let loading: Promise<void> | null = null;

/** Loads settings from the database into memory. Called at the start of every request and job run. */
export async function loadSettings(force = false): Promise<void> {
  if (!force && Date.now() - loadedAt < TTL_MS) return;
  if (loading) return loading;
  loading = (async () => {
    try {
      const rows = await getDb().select().from(appSettings);
      const next = new Map<string, string>();
      for (const r of rows) {
        try {
          const v = decrypt(r.value);
          if (v.trim()) next.set(r.key, v);
        } catch {
          // Unreadable with the current ENCRYPTION_KEY: ignore it, the environment value (if any) is used.
        }
      }
      snapshot = next;
      loadedAt = Date.now();
    } catch {
      // Database unavailable: keep the last good snapshot and carry on with environment values.
    } finally {
      loading = null;
    }
  })();
  return loading;
}

/** Current value of a setting: the admin-set value first, then the environment variable. Empty means unset. */
export function cfg(key: string): string | undefined {
  const fromDb = snapshot.get(key);
  if (fromDb !== undefined) return fromDb;
  const fromEnv = process.env[key];
  return fromEnv && fromEnv.trim() ? fromEnv : undefined;
}

export const cfgOn = (key: string) => cfg(key) === '1' || cfg(key) === 'true';

export function settingSource(key: string): 'admin' | 'env' | 'unset' {
  if (snapshot.has(key)) return 'admin';
  return cfg(key) ? 'env' : 'unset';
}

function mask(value: string, def: SettingDef) {
  if (def.file) return `${value.length.toLocaleString('en-GB')} characters uploaded`;
  if (!def.secret) return value;
  return value.length <= 4 ? '••••' : `••••${value.slice(-4)}`;
}

export type SettingStatus = { key: string; group: Group; label: string; help: string; secret: boolean; file: boolean; source: 'admin' | 'env' | 'unset'; preview: string | null };

/** What the admin screen shows. Secret values never leave the server. */
export async function listSettings(): Promise<SettingStatus[]> {
  await loadSettings();
  return SETTINGS.map((def) => {
    const source = settingSource(def.key);
    const value = source === 'unset' ? undefined : cfg(def.key);
    return {
      key: def.key, group: def.group, label: def.label, help: def.help, secret: def.secret, file: !!def.file, source,
      preview: value === undefined ? null : mask(value, def),
    };
  });
}

export type Actor = { id: string; email: string };

/** Saves a value (or clears it when value is empty). Records who changed it, never the value itself. */
export async function saveSetting(key: string, rawValue: string, actor: Actor): Promise<void> {
  const def = DEFS.get(key);
  if (!def) throw new AppError(400, 'unknown_setting', 'Unknown setting');
  const value = rawValue.replace(/\r\n/g, '\n').trim();
  const db = getDb();
  if (!value) {
    await db.delete(appSettings).where(eq(appSettings.key, key));
    await audit(actor, 'setting.clear', key, def.group);
  } else {
    if (value.length > 20_000) throw new AppError(400, 'too_long', 'That value is too long');
    const box = encrypt(value);
    await db.insert(appSettings).values({ key, value: box, updatedBy: actor.id })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: box, updatedAt: sql`now()`, updatedBy: actor.id } });
    await audit(actor, 'setting.save', key, def.group);
  }
  await loadSettings(true);
}

async function audit(actor: Actor, action: string, key: string, group: string) {
  await getDb().insert(adminAudit).values({
    adminId: actor.id, adminEmail: actor.email, action, targetType: 'setting', targetId: key, targetLabel: key,
    details: JSON.stringify({ group }),
  });
}
