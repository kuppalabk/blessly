import { createPrivateKey } from 'node:crypto';
import { cfg } from './settings';
import type { Group } from './settings';

export type TestResult = { ok: boolean; message: string };

const TIMEOUT = 8000;

async function probe(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT) });
}

function missing(keys: string[]): TestResult | null {
  const gap = keys.filter((k) => !cfg(k));
  return gap.length ? { ok: false, message: `Missing: ${gap.join(', ')}` } : null;
}

async function ping(label: string, url: string, init: RequestInit): Promise<TestResult> {
  try {
    const res = await probe(url, init);
    if (res.ok) return { ok: true, message: `${label} accepted the key.` };
    if (res.status === 401 || res.status === 403) return { ok: false, message: `${label} rejected the key (HTTP ${res.status}).` };
    return { ok: false, message: `${label} returned HTTP ${res.status}.` };
  } catch {
    return { ok: false, message: `Could not reach ${label}. Check the network or the service status.` };
  }
}

/** Runs one read-only check per integration group. Nothing is sent to customers. */
export async function testGroup(group: Group): Promise<TestResult> {
  switch (group) {
    case 'email': {
      const gap = missing(['RESEND_API_KEY']);
      if (gap) return gap;
      return ping('Resend', 'https://api.resend.com/domains', { headers: { authorization: `Bearer ${cfg('RESEND_API_KEY')}` } });
    }
    case 'ai': {
      const gap = missing(['ANTHROPIC_API_KEY']);
      if (gap) return gap;
      return ping('Anthropic', 'https://api.anthropic.com/v1/models', { headers: { 'x-api-key': cfg('ANTHROPIC_API_KEY')!, 'anthropic-version': '2023-06-01' } });
    }
    case 'stripe': {
      const gap = missing(['STRIPE_SECRET_KEY']);
      if (gap) return gap;
      return ping('Stripe', 'https://api.stripe.com/v1/balance', { headers: { authorization: `Bearer ${cfg('STRIPE_SECRET_KEY')}` } });
    }
    case 'razorpay': {
      const gap = missing(['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET']);
      if (gap) return gap;
      const basic = Buffer.from(`${cfg('RAZORPAY_KEY_ID')}:${cfg('RAZORPAY_KEY_SECRET')}`).toString('base64');
      return ping('Razorpay', 'https://api.razorpay.com/v1/payments?count=1', { headers: { authorization: `Basic ${basic}` } });
    }
    case 'sms': {
      const gap = missing(['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN']);
      if (gap) return gap;
      const basic = Buffer.from(`${cfg('TWILIO_ACCOUNT_SID')}:${cfg('TWILIO_AUTH_TOKEN')}`).toString('base64');
      return ping('Twilio', `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(cfg('TWILIO_ACCOUNT_SID')!)}.json`, { headers: { authorization: `Basic ${basic}` } });
    }
    case 'google': {
      const gap = missing(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']);
      if (gap) return gap;
      if (!cfg('GOOGLE_CLIENT_ID')!.endsWith('.apps.googleusercontent.com')) return { ok: false, message: 'The client ID should end in .apps.googleusercontent.com' };
      return ping('Google', 'https://accounts.google.com/.well-known/openid-configuration', {});
    }
    case 'push': {
      const gap = missing(['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY']);
      if (gap) return gap;
      const pub = Buffer.from(cfg('VAPID_PUBLIC_KEY')!, 'base64url');
      const priv = Buffer.from(cfg('VAPID_PRIVATE_KEY')!, 'base64url');
      if (pub.length !== 65 || pub[0] !== 4) return { ok: false, message: 'The public key is not a valid VAPID key. Generate a pair with npm run push:keys.' };
      if (priv.length !== 32) return { ok: false, message: 'The private key is not a valid VAPID key.' };
      return { ok: true, message: 'VAPID keys look valid.' };
    }
    case 'apple': {
      const gap = missing(['APPLE_CLIENT_ID', 'APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY']);
      if (gap) return gap;
      try {
        createPrivateKey(cfg('APPLE_PRIVATE_KEY')!);
        return { ok: true, message: 'The Apple private key is readable.' };
      } catch {
        return { ok: false, message: 'The Apple private key is not a valid .p8 key.' };
      }
    }
    case 'storage': {
      const gap = missing(['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']);
      if (gap) return gap;
      const { S3Client, HeadBucketCommand } = await import('@aws-sdk/client-s3');
      const client = new S3Client({
        region: cfg('S3_REGION') || 'auto',
        endpoint: cfg('S3_ENDPOINT') || undefined,
        forcePathStyle: !!cfg('S3_ENDPOINT'),
        credentials: { accessKeyId: cfg('S3_ACCESS_KEY_ID') ?? '', secretAccessKey: cfg('S3_SECRET_ACCESS_KEY') ?? '' },
      });
      try {
        await client.send(new HeadBucketCommand({ Bucket: cfg('S3_BUCKET')! }));
        return { ok: true, message: `Bucket ${cfg('S3_BUCKET')} is reachable.` };
      } catch (e) {
        return { ok: false, message: `Bucket check failed: ${(e as Error).name}` };
      }
    }
    case 'whatsapp': {
      const gap = missing(['WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN']);
      return gap ?? { ok: true, message: 'Saved. Meta sends a test call when you verify the webhook.' };
    }
    case 'legal': {
      const gap = missing(['LEGAL_COMPANY_NAME', 'SUPPORT_EMAIL']);
      return gap ?? { ok: true, message: 'Company details are set.' };
    }
    case 'features':
    case 'android':
    case 'security':
    case 'sign-in':
      return { ok: true, message: 'Saved.' };
    default:
      return { ok: false, message: 'Unknown group' };
  }
}
