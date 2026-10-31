import { cfg } from '../settings';
import type { DB } from '../db';
import { outbox } from '../schema';

export interface SmsProvider { name: string; send(to: string, text: string): Promise<{ id: string | null }> }

/** Development: nothing is sent; the message is kept in the outbox (and the code is shown on screen in development only). */
export class OutboxSms implements SmsProvider {
  name = 'outbox';
  async send() { return { id: null }; }
}

/** Twilio Programmable Messaging — used when TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM are set. */
export class TwilioSms implements SmsProvider {
  name = 'twilio';
  constructor(private sid: string, private token: string, private from: string, private fetchImpl: typeof fetch = fetch) {}
  async send(to: string, text: string) {
    const res = await this.fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.sid)}/Messages.json`, {
      method: 'POST',
      headers: { authorization: `Basic ${Buffer.from(`${this.sid}:${this.token}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: to, From: this.from, Body: text }),
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) throw new Error(`SMS provider returned ${res.status}`);
    return { id: ((await res.json()) as { sid?: string }).sid ?? null };
  }
}

export function smsProviderFromEnv(env = process.env): SmsProvider {
  return (cfg('TWILIO_ACCOUNT_SID') ?? '') && (cfg('TWILIO_AUTH_TOKEN') ?? '') && (cfg('TWILIO_FROM') ?? '') ? new TwilioSms((cfg('TWILIO_ACCOUNT_SID') ?? ''), (cfg('TWILIO_AUTH_TOKEN') ?? ''), (cfg('TWILIO_FROM') ?? '')) : new OutboxSms();
}

export async function sendSms(db: DB, provider: SmsProvider, to: string, text: string) {
  const { id } = await provider.send(to, text);
  // Codes are never stored in the clear: the outbox keeps only that a code was sent.
  await db.insert(outbox).values({ channel: 'sms', recipient: to, subject: null, body: text.replace(/\b\d{6}\b/g, '••••••'), provider: provider.name, providerId: id });
}
