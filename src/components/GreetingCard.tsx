import type { CSSProperties } from 'react';
import { cardDesign } from '@/lib/cards';
import type { OccasionId } from '@/lib/i18n-data';

/** Scripts that need a Noto fallback font; loaded only when a card uses that language. */
export const SCRIPT_FONT: Record<string, string> = {
  hi: 'Noto Sans Devanagari', mr: 'Noto Sans Devanagari', mai: 'Noto Sans Devanagari', ne: 'Noto Sans Devanagari', kok: 'Noto Sans Devanagari',
  bn: 'Noto Sans Bengali', as: 'Noto Sans Bengali', ta: 'Noto Sans Tamil', te: 'Noto Sans Telugu', gu: 'Noto Sans Gujarati', pa: 'Noto Sans Gurmukhi',
  kn: 'Noto Sans Kannada', or: 'Noto Sans Oriya', ml: 'Noto Sans Malayalam', ar: 'Noto Naskh Arabic', ur: 'Noto Naskh Arabic', fa: 'Noto Naskh Arabic',
  zh: 'Noto Sans SC', ja: 'Noto Sans JP', ko: 'Noto Sans KR'
};

export function ScriptFont({ language }: { language: string }) {
  const family = SCRIPT_FONT[language];
  if (!family) return null;
  const href = `https://fonts.googleapis.com/css2?family=${family.replaceAll(' ', '+')}:wght@500;700&display=swap`;
  // Deliberately not using React's `precedence` (suspending) stylesheets: a slow or blocked font
  // must never hold up the UI. Text renders in a fallback font and swaps when the font arrives.
  return <link rel="stylesheet" href={href} />;
}

type Props = {
  occasion: OccasionId;
  designIndex: number;
  greeting: string;
  to?: string;
  sub?: string;
  language?: string;
  rtl?: boolean;
  label?: string;
};

/** Renders one of the 250 designs for an occasion. Sizes scale with the card width (container query units). */
export function GreetingCard({ occasion, designIndex, greeting, to, sub, language = 'en', rtl, label }: Props) {
  const d = cardDesign(occasion, designIndex);
  const L = d.layout;
  const art = d.art;
  const solid = L === 'Ribbon' || L === 'Footer';
  const textColor = solid ? d.palette.ink : art.dark ? '#FFFFFF' : '#1E1B2E';
  const shadow = L === 'Open' || L === 'Frame' ? (art.dark ? '0 0.5cqw 3cqw rgba(0,0,0,.6)' : '0 0.4cqw 3cqw rgba(255,255,255,.95)') : 'none';
  const script = SCRIPT_FONT[language] ? `'${SCRIPT_FONT[language]}', ` : '';
  const len = greeting.length;
  const scale = (L === 'Glass' ? 0.82 : 1) * (len > 28 ? 0.62 : len > 20 ? 0.78 : len > 14 ? 0.9 : 1) * (language !== 'en' ? 0.94 : 1);
  const gsize = (d.typeStyle.size / 1.9) * scale;

  const panel: CSSProperties | null =
    L === 'Ribbon' ? { position: 'absolute', left: 0, right: 0, top: '40%', height: '31%', background: d.palette.bg, opacity: 0.93, boxShadow: '0 1cqw 4cqw rgba(0,0,0,.18)' }
    : L === 'Glass' ? { position: 'absolute', left: '9%', right: '9%', top: '37%', height: '36%', borderRadius: '7cqw', background: art.dark ? 'rgba(12,10,24,.55)' : 'rgba(255,255,255,.8)', border: `1px solid ${art.dark ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.95)'}` }
    : L === 'Footer' ? { position: 'absolute', left: 0, right: 0, bottom: 0, height: '36%', background: d.palette.bg, borderTop: `1.5cqw solid ${d.palette.accent}` }
    : null;
  const textPos: CSSProperties =
    L === 'Footer' ? { bottom: '7%', left: '8%', right: '8%' }
    : L === 'Glass' ? { top: '41%', left: '14%', right: '14%' }
    : L === 'Frame' ? { top: '45%', left: '15%', right: '15%' }
    : { top: L === 'Ribbon' ? '43%' : '45%', left: '8%', right: '8%' };

  return (
    <div className="wcard" role="img" aria-label={label ?? `${greeting}${to ? ', ' + to : ''} — design ${d.number}`} style={{ backgroundColor: d.palette.bg, backgroundImage: `url(${art.src})` }}>
      {panel && <div style={panel} />}
      {L === 'Frame' && <div style={{ position: 'absolute', inset: '5cqw', border: `1cqw solid ${art.dark ? '#fff' : d.palette.accent}`, borderRadius: '4cqw', opacity: 0.85 }} />}
      <div dir={rtl ? 'rtl' : 'ltr'} style={{ position: 'absolute', ...textPos, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', color: textColor, textShadow: shadow }}>
        {to ? <p style={{ margin: '0 0 2.5cqw', fontSize: '5.5cqw', fontWeight: 700, letterSpacing: '.06em', textTransform: language === 'en' ? 'uppercase' : 'none', fontFamily: `'DM Sans', ${script}sans-serif`, opacity: 0.85 }}>{to}</p> : null}
        <p style={{ margin: 0, fontFamily: `${d.typeStyle.font.split(',')[0]}, ${script}sans-serif`, fontWeight: d.typeStyle.weight, fontSize: `${gsize}cqw`, lineHeight: d.typeStyle.upper ? 1.25 : 1.08, textTransform: d.typeStyle.upper && language === 'en' ? 'uppercase' : 'none', letterSpacing: d.typeStyle.upper && language === 'en' ? '.1em' : 'normal', overflowWrap: 'anywhere' }}>{greeting}</p>
        {sub ? <p style={{ margin: '3cqw 0 0', fontSize: '5.5cqw', lineHeight: 1.35, fontStyle: d.typeStyle.name === 'Elegant' ? 'italic' : 'normal', opacity: 0.88 }}>{sub}</p> : null}
      </div>
    </div>
  );
}
