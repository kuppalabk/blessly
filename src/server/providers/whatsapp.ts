import { cfg } from '../settings';
/**
 * WhatsApp Business Platform — Cloud API (Meta's official API).
 * Businesses connect their own WhatsApp Business number; messages outside a customer-started chat must use
 * a template Meta has approved. Meta bills the business per delivered message.
 */

export type WaTemplate = { name: string; language: string; category: string; status: string; body: string; paramCount: number };
export type WaCreds = { phoneNumberId: string; token: string };

/** Error from Meta. `retryable` = worth trying again later; `optedOut` = the person stopped marketing messages. */
export class WhatsAppError extends Error {
  constructor(message: string, public code: number | null, public retryable: boolean, public optedOut = false) {
    super(message);
  }
}

// Codes from Meta's error reference.
const RETRYABLE = new Set([1, 2, 4, 80007, 130429, 131000, 131016, 133004]);
const OPTED_OUT = 131050; // user stopped marketing messages from this business
const RATE_CAPPED = 131049; // Meta limited marketing messages to this user for now — don't retry today

export interface WhatsAppProvider {
  sendTemplate(creds: WaCreds, msg: { to: string; template: string; language: string; params: string[] }): Promise<{ id: string }>;
  phoneNumber(creds: WaCreds): Promise<{ displayNumber: string; verifiedName: string }>;
  templates(wabaId: string, token: string): Promise<WaTemplate[]>;
}

export class CloudApiProvider implements WhatsAppProvider {
  constructor(
    private base = process.env.WHATSAPP_API_BASE || 'https://graph.facebook.com',
    private version = cfg('WHATSAPP_GRAPH_VERSION') || 'v23.0',
    private fetchImpl: typeof fetch = fetch
  ) {}

  private async call<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}/${this.version}/${path}`, {
        ...init,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(15000)
      });
    } catch (e) {
      throw new WhatsAppError(`Couldn’t reach WhatsApp: ${(e as Error).message}`, null, true);
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = (body as { error?: { code?: number; message?: string; error_data?: { details?: string } } }).error ?? {};
      const code = err.code ?? null;
      const msg = `${err.message ?? `WhatsApp returned ${res.status}`}${err.error_data?.details ? ` — ${err.error_data.details}` : ''}`;
      throw new WhatsAppError(msg.slice(0, 400), code, res.status >= 500 || res.status === 429 || (code !== null && RETRYABLE.has(code)), code === OPTED_OUT);
    }
    return body as T;
  }

  async sendTemplate(creds: WaCreds, m: { to: string; template: string; language: string; params: string[] }) {
    const body = {
      messaging_product: 'whatsapp', recipient_type: 'individual', to: m.to, type: 'template',
      template: { name: m.template, language: { code: m.language }, components: m.params.length ? [{ type: 'body', parameters: m.params.map((text) => ({ type: 'text', text })) }] : [] }
    };
    const r = await this.call<{ messages?: { id: string }[] }>(`${encodeURIComponent(creds.phoneNumberId)}/messages`, creds.token, { method: 'POST', body: JSON.stringify(body) });
    const id = r.messages?.[0]?.id;
    if (!id) throw new WhatsAppError('WhatsApp did not return a message id', null, true);
    return { id };
  }

  async phoneNumber(creds: WaCreds) {
    const r = await this.call<{ display_phone_number?: string; verified_name?: string }>(`${encodeURIComponent(creds.phoneNumberId)}?fields=display_phone_number,verified_name`, creds.token);
    return { displayNumber: r.display_phone_number ?? '', verifiedName: r.verified_name ?? '' };
  }

  async templates(wabaId: string, token: string) {
    type Raw = { name: string; language: string; category: string; status: string; components?: { type: string; text?: string }[] };
    const out: WaTemplate[] = [];
    let path: string | null = `${encodeURIComponent(wabaId)}/message_templates?fields=name,language,category,status,components&limit=100`;
    for (let page = 0; path && page < 10; page++) {
      const r: { data?: Raw[]; paging?: { next?: string } } = await this.call(path, token);
      for (const t of r.data ?? []) {
        const body = t.components?.find((c) => c.type === 'BODY')?.text ?? '';
        const params = new Set([...body.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((x) => x[1]));
        out.push({ name: t.name, language: t.language, category: t.category, status: t.status, body, paramCount: params.size });
      }
      const next: string | undefined = r.paging?.next;
      path = next ? next.replace(/^https?:\/\/[^/]+\/v[\d.]+\//, '') : null;
    }
    return out;
  }
}

export { OPTED_OUT, RATE_CAPPED };
