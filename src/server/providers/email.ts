import { cfg } from '../settings';
import type { DB } from '../db';
import { outbox } from '../schema';

export type EmailMessage = { to: string; subject: string; text: string };

export interface EmailProvider {
  name: string;
  send(msg: EmailMessage): Promise<{ id: string | null }>;
}

/** Development provider: records the email in the outbox table; nothing leaves the server. */
export class OutboxOnlyProvider implements EmailProvider {
  name = 'outbox';
  async send() {
    return { id: null };
  }
}

/** Resend (https://resend.com) — used when RESEND_API_KEY is set. */
export class ResendProvider implements EmailProvider {
  name = 'resend';
  constructor(private apiKey: string, private from: string, private fetchImpl: typeof fetch = fetch) {}
  async send(msg: EmailMessage) {
    const res = await this.fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [msg.to], subject: msg.subject, text: msg.text }),
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) throw new Error(`Email provider returned ${res.status}`);
    const json = (await res.json()) as { id?: string };
    return { id: json.id ?? null };
  }
}

export function emailProviderFromEnv(env = process.env): EmailProvider {
  return (cfg('RESEND_API_KEY') ?? '') ? new ResendProvider((cfg('RESEND_API_KEY') ?? ''), (cfg('EMAIL_FROM') ?? '') || 'Blessly <wishes@example.com>') : new OutboxOnlyProvider();
}

/** Sends through the provider and always records the message in the outbox. */
export async function sendEmail(db: DB, provider: EmailProvider, msg: EmailMessage) {
  const { id } = await provider.send(msg);
  await db.insert(outbox).values({ channel: 'email', recipient: msg.to, subject: msg.subject, body: msg.text, provider: provider.name, providerId: id });
}
