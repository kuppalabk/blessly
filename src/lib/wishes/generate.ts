import { cfg } from '@/server/settings';
import { LANGUAGES, OCCASIONS } from '../i18n-data';
import { templateWish, type Tone, type WishInput } from './templates';

export type WishResult = { text: string; tone: Tone; source: 'ai' | 'template' };

export interface WishProvider {
  name: string;
  write(input: WishInput): Promise<string>;
}

/** Calls the Anthropic Messages API. Only used when ANTHROPIC_API_KEY is set. */
export class AnthropicWishProvider implements WishProvider {
  name = 'anthropic';
  constructor(private apiKey: string, private model: string, private fetchImpl: typeof fetch = fetch) {}

  async write(input: WishInput): Promise<string> {
    const lang = LANGUAGES.find((l) => l.code === input.language)?.label ?? 'English';
    const occasion = OCCASIONS.find((o) => o.id === input.occasion)?.label ?? input.occasion;
    const prompt = [
      `Write one ${input.tone} ${occasion} wish in ${lang} for ${input.recipientName}${input.relationship ? ` (my ${input.relationship})` : ''}.`,
      input.detail ? `Personal detail to weave in: ${input.detail}` : '',
      input.tone === 'short' ? 'Keep it under 20 words.' : 'Keep it under 60 words.',
      'Write only the wish text in that language. No quotes, no preamble, no hashtags.',
      input.occasion === 'condolence' ? 'This is a sympathy message: be gentle and never celebratory or funny.' : ''
    ].filter(Boolean).join('\n');
    const res = await this.fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: this.model, max_tokens: 300, messages: [{ role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) throw new Error(`AI provider returned ${res.status}`);
    const json = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = json.content?.filter((c) => c.type === 'text').map((c) => c.text).join('').trim();
    if (!text || text.length > 1200) throw new Error('AI provider returned an unusable wish');
    return text;
  }
}

export function providerFromEnv(env = process.env): WishProvider | null {
  return (cfg('ANTHROPIC_API_KEY') ?? '') ? new AnthropicWishProvider((cfg('ANTHROPIC_API_KEY') ?? ''), (cfg('ANTHROPIC_MODEL') ?? '') || 'claude-sonnet-5-5') : null;
}

/** Writes a wish with the AI provider when configured, falling back to built-in templates on any error. */
export async function generateWish(input: WishInput, provider: WishProvider | null = providerFromEnv()): Promise<WishResult> {
  if (provider) {
    try {
      let text = await provider.write(input);
      if (input.senderName) text += `\n— ${input.senderName.trim().slice(0, 80)}`;
      return { text, tone: input.tone, source: 'ai' };
    } catch (e) {
      console.warn('[wishes] AI provider failed, using template:', (e as Error).message);
    }
  }
  const t = templateWish(input);
  return { text: t.text, tone: t.toneUsed, source: 'template' };
}
