import { cfg } from '../settings';
import webpush from 'web-push';

export type PushTarget = { endpoint: string; p256dh: string; auth: string };
export type PushPayload = { title: string; body: string; url: string; tag?: string };
export type PushResult = { ok: true } | { ok: false; gone: boolean; error: string };

export interface PushProvider {
  name: string;
  publicKey: string;
  send(target: PushTarget, payload: PushPayload): Promise<PushResult>;
}

/** Web Push (VAPID). Works with Chrome, Edge, Firefox, Android and installed iOS/iPadOS 16.4+ web apps. */
export class WebPushProvider implements PushProvider {
  name = 'web-push';
  constructor(public publicKey: string, private privateKey: string, private subject: string) {}
  async send(target: PushTarget, payload: PushPayload): Promise<PushResult> {
    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        JSON.stringify(payload),
        { vapidDetails: { subject: this.subject, publicKey: this.publicKey, privateKey: this.privateKey }, TTL: 6 * 3600, timeout: 15000, urgency: 'normal' }
      );
      return { ok: true };
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      // 404/410: the browser unsubscribed or the subscription expired — remove it.
      return { ok: false, gone: status === 404 || status === 410, error: `${status ?? ''} ${(e as Error).message}`.trim().slice(0, 300) };
    }
  }
}

/** Null when VAPID keys aren't configured: the app then shows in-app alerts and email only. */
export function pushProviderFromEnv(): PushProvider | null {
  const pub = cfg('VAPID_PUBLIC_KEY'), priv = cfg('VAPID_PRIVATE_KEY');
  if (!pub || !priv) return null;
  return new WebPushProvider(pub, priv, cfg('VAPID_SUBJECT') || 'mailto:hello@blessly.app');
}
