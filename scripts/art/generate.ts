/**
 * Generates the card artwork for occasions added after launch: two original illustrations per occasion
 * (900×1200 JPEG), with motifs at the top and bottom and a clear middle for the greeting.
 *   npx tsx scripts/art/generate.ts [occasion…]
 */
import sharp from 'sharp';
import path from 'node:path';

const W = 900, H = 1200;

/* Seeded random so artwork is reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const pick = <T,>(r: () => number, a: T[]) => a[Math.floor(r() * a.length)];
const n = (x: number) => x.toFixed(1);

type Variant = { dark: boolean; bg: [string, string]; glow: string[] };
type Scene = (r: () => number, v: Variant) => string;

function frame(v: Variant, body: string, r: () => number) {
  const bokeh = Array.from({ length: 18 }, () => {
    const x = r() * W, y = r() * H, rad = 20 + r() * 70;
    return `<circle cx="${n(x)}" cy="${n(y)}" r="${n(rad)}" fill="${pick(r, v.glow)}" opacity="${n(0.12 + r() * 0.2)}" filter="url(#blur)"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${v.bg[0]}"/><stop offset="1" stop-color="${v.bg[1]}"/></linearGradient>
  <filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="22"/></filter>
  <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
  <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#000" flood-opacity="${v.dark ? 0.45 : 0.18}"/></filter>
  <radialGradient id="shine" cx="0.35" cy="0.3" r="0.7"><stop offset="0" stop-color="#fff" stop-opacity="0.65"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>${bokeh}${body}</svg>`;
}

function sparkles(r: () => number, count: number, color: string, area: [number, number, number, number] = [0, 0, W, H]) {
  return Array.from({ length: count }, () => {
    const x = area[0] + r() * (area[2] - area[0]), y = area[1] + r() * (area[3] - area[1]), s = 5 + r() * 12;
    return `<path d="M${n(x)} ${n(y - s)}Q${n(x)} ${n(y)} ${n(x + s)} ${n(y)}Q${n(x)} ${n(y)} ${n(x)} ${n(y + s)}Q${n(x)} ${n(y)} ${n(x - s)} ${n(y)}Q${n(x)} ${n(y)} ${n(x)} ${n(y - s)}z" fill="${color}" opacity="${n(0.5 + r() * 0.5)}"/>`;
  }).join('');
}

function confetti(r: () => number, count: number, colors: string[], y0: number, y1: number) {
  return Array.from({ length: count }, () => {
    const x = r() * W, y = y0 + r() * (y1 - y0), c = pick(r, colors), rot = r() * 180;
    return r() < 0.5
      ? `<rect x="${n(x)}" y="${n(y)}" width="14" height="6" rx="2" fill="${c}" transform="rotate(${n(rot)} ${n(x)} ${n(y)})"/>`
      : `<circle cx="${n(x)}" cy="${n(y)}" r="${n(3 + r() * 4)}" fill="${c}"/>`;
  }).join('');
}

const heart = (x: number, y: number, s: number, fill: string, extra = '') =>
  `<path d="M${n(x)} ${n(y + s * 0.9)}C${n(x - s * 1.4)} ${n(y)} ${n(x - s * 0.9)} ${n(y - s * 0.9)} ${n(x)} ${n(y - s * 0.3)}C${n(x + s * 0.9)} ${n(y - s * 0.9)} ${n(x + s * 1.4)} ${n(y)} ${n(x)} ${n(y + s * 0.9)}z" fill="${fill}" ${extra}/>`;

function flower(x: number, y: number, s: number, petal: string, centre: string, petals = 6, rot = 0) {
  const ps = Array.from({ length: petals }, (_, i) => `<ellipse cx="${n(x)}" cy="${n(y - s * 0.55)}" rx="${n(s * 0.32)}" ry="${n(s * 0.55)}" fill="${petal}" transform="rotate(${n(rot + (360 / petals) * i)} ${n(x)} ${n(y)})"/>`).join('');
  return `<g filter="url(#shadow)">${ps}<circle cx="${n(x)}" cy="${n(y)}" r="${n(s * 0.28)}" fill="${centre}"/></g>`;
}

function leaf(x: number, y: number, s: number, rot: number, fill: string) {
  return `<path d="M${n(x)} ${n(y)}c${n(s * 0.5)} ${n(-s * 0.3)} ${n(s * 0.9)} ${n(-s)} 0 ${n(-s * 1.6)}c${n(-s * 0.9)} ${n(s * 0.6)} ${n(-s * 0.5)} ${n(s * 1.3)} 0 ${n(s * 1.6)}z" fill="${fill}" transform="rotate(${n(rot)} ${n(x)} ${n(y)})"/>`;
}

function hills(color: string, y: number, amp: number, r: () => number) {
  let d = `M0 ${H}L0 ${y}`;
  for (let x = 0; x <= W; x += 150) d += ` Q${x + 75} ${n(y - amp * (0.5 + r()))} ${x + 150} ${n(y + (r() - 0.5) * amp * 0.4)}`;
  return `<path d="${d} L${W} ${H}z" fill="${color}"/>`;
}

/* ---------------- Scenes ---------------- */

const SCENES: Record<string, Scene> = {
  engagement: (r, v) => {
    const gold = '#E2B04A';
    const ring = (cx: number, cy: number) => `<circle cx="${cx}" cy="${cy}" r="70" fill="none" stroke="${gold}" stroke-width="16" filter="url(#shadow)"/><circle cx="${cx}" cy="${cy}" r="70" fill="none" stroke="#FFF3C4" stroke-width="4" opacity="0.7" stroke-dasharray="60 380"/>`;
    const gem = `<path d="M450 120l40 34-40 56-40-56z" fill="#DDF3FF" stroke="#9BD3F5" stroke-width="3" filter="url(#shadow)"/><path d="M410 154h80" stroke="#9BD3F5" stroke-width="3"/>`;
    const hearts = Array.from({ length: 16 }, () => heart(r() * W, 900 + r() * 260, 10 + r() * 22, pick(r, ['#F06C8F', '#F8A5BC', '#E2B04A']), `opacity="${n(0.6 + r() * 0.4)}"`)).join('');
    return `<g transform="translate(450 240) scale(1.7) translate(-450 -240)">${ring(410, 260) + ring(490, 260) + gem}</g>` + sparkles(r, 26, v.dark ? '#FFE6A8' : '#E2B04A', [0, 0, W, 420]) + hearts;
  },
  babyshower: (r, v) => {
    const flags = Array.from({ length: 9 }, (_, i) => { const x = 40 + i * 100, y = 90 + Math.sin(i / 8 * Math.PI) * 60; return `<path d="M${x} ${n(y)}l50 0-25 70z" fill="${pick(r, ['#9AD8F5', '#F9C0D3', '#FFE29A', '#BDE7C9'])}" filter="url(#shadow)"/>`; }).join('');
    const line = `<path d="M20 90 Q450 230 880 90" fill="none" stroke="#C9A98A" stroke-width="4"/>`;
    const cloud = (x: number, y: number, s: number) => `<g fill="#fff" opacity="0.95" filter="url(#shadow)"><circle cx="${x}" cy="${y}" r="${40 * s}"/><circle cx="${x + 45 * s}" cy="${y - 20 * s}" r="${50 * s}"/><circle cx="${x + 95 * s}" cy="${y}" r="${40 * s}"/><rect x="${x}" y="${y}" width="${95 * s}" height="${40 * s}"/></g>`;
    const stars = sparkles(r, 20, '#FFD36B', [0, 200, W, 420]);
    const bottles = [200, 450, 700].map((x, i) => `<g filter="url(#shadow)"><rect x="${x - 30}" y="${980 - i % 2 * 30}" width="60" height="110" rx="20" fill="${['#9AD8F5', '#F9C0D3', '#FFE29A'][i]}"/><rect x="${x - 18}" y="${950 - i % 2 * 30}" width="36" height="34" rx="8" fill="#fff"/><path d="M${x - 10} ${928 - i % 2 * 30}h20l-4 22h-12z" fill="#F7B267"/></g>`).join('');
    return line + flags + stars + cloud(90, 1070, 1.2) + cloud(640, 1100, 1.1) + bottles;
  },
  mothersday: (r, v) => {
    const fl = Array.from({ length: 9 }, (_, i) => flower(60 + i * 100 + r() * 30, 1060 + r() * 90, 50 + r() * 30, pick(r, ['#F27D9F', '#F7A8C0', '#F9D6E2', '#E05A84']), '#FFD36B', 6, r() * 60)).join('');
    const leaves = Array.from({ length: 14 }, () => leaf(r() * W, 1120 + r() * 60, 40 + r() * 30, -60 + r() * 120, '#6FAF7E')).join('');
    const hearts = Array.from({ length: 12 }, () => heart(r() * W, 60 + r() * 320, 14 + r() * 30, pick(r, ['#F27D9F', '#F7A8C0', '#E05A84']), `opacity="${n(0.6 + r() * 0.4)}"`)).join('');
    return leaves + fl + hearts + sparkles(r, 14, v.dark ? '#FFE6A8' : '#F7A8C0', [0, 0, W, 400]);
  },
  fathersday: (r, v) => {
    const tie = `<g filter="url(#shadow)" transform="translate(450 190) scale(2.4)"><path d="M-55 -35l55 25 55-25v70l-55-25-55 25z" fill="#2F6BD8"/><circle r="18" fill="#1E4FA8"/><path d="M-50 -28l40 18M50 -28l-40 18" stroke="#ffffff55" stroke-width="5"/></g>`;
    const stars = Array.from({ length: 18 }, () => { const x = r() * W, y = 900 + r() * 260, s = 10 + r() * 22; return `<path d="M${n(x)} ${n(y - s)}l${n(s * 0.3)} ${n(s * 0.7)} ${n(s * 0.7)} 0-${n(s * 0.55)} ${n(s * 0.45)} ${n(s * 0.25)} ${n(s * 0.75)}-${n(s * 0.7)}-${n(s * 0.45)}-${n(s * 0.7)} ${n(s * 0.45)} ${n(s * 0.25)}-${n(s * 0.75)}-${n(s * 0.55)}-${n(s * 0.45)} ${n(s * 0.7)} 0z" fill="${pick(r, ['#FFC845', '#7FB2FF', '#FFFFFF'])}" opacity="${n(0.6 + r() * 0.4)}"/>`; }).join('');
    const mug = `<g filter="url(#shadow)" transform="translate(720 1010)"><rect x="-55" y="-60" width="110" height="130" rx="16" fill="#F2F2F2"/><path d="M55 -30c45 0 45 60 0 60" fill="none" stroke="#F2F2F2" stroke-width="16"/><text x="0" y="20" font-family="sans-serif" font-size="44" font-weight="700" text-anchor="middle" fill="#2F6BD8">#1</text></g>`;
    return tie + sparkles(r, 20, v.dark ? '#FFE6A8' : '#7FB2FF', [0, 0, W, 380]) + stars + mug;
  },
  grandparents: (r, v) => {
    const fl = Array.from({ length: 7 }, (_, i) => flower(90 + i * 120, 1080 + r() * 60, 45 + r() * 20, pick(r, ['#F4B183', '#F7D08A', '#C9A7EB']), '#fff', 5, r() * 60)).join('');
    const leaves = Array.from({ length: 12 }, () => leaf(r() * W, 1140, 40 + r() * 30, -50 + r() * 100, '#88B78F')).join('');
    const glasses = `<g transform="translate(450 190) scale(1.6) translate(-450 -190)" fill="none" stroke="${v.dark ? '#F3E3C8' : '#7A5C3E'}" stroke-width="10" filter="url(#shadow)"><circle cx="380" cy="190" r="60"/><circle cx="520" cy="190" r="60"/><path d="M440 185q10-14 20 0M320 180l-60-20M580 180l60-20"/></g>`;
    const hearts = Array.from({ length: 8 }, () => heart(r() * W, 60 + r() * 330, 12 + r() * 20, pick(r, ['#F28B82', '#F4B183']), 'opacity="0.8"')).join('');
    return glasses + hearts + leaves + fl;
  },
  valentines: (r, v) => {
    const big = heart(450, 220, 130, 'url(#shine)') ;
    const hearts = Array.from({ length: 30 }, () => heart(r() * W, r() < 0.5 ? 40 + r() * 360 : 880 + r() * 300, 10 + r() * 34, pick(r, ['#E63B60', '#F06C8F', '#FF9AB5', '#B5174A']), `opacity="${n(0.55 + r() * 0.45)}" transform="rotate(${n(-25 + r() * 50)} 450 600)"`)).join('');
    return heart(450, 220, 130, '#E63B60', 'filter="url(#shadow)"') + big + hearts;
  },
  housewarming: (r, v) => {
    const houses = [[150, 1040, '#F4A261'], [330, 1000, '#E76F51'], [520, 1030, '#2A9D8F'], [720, 1010, '#E9C46A']].map(([x, y, c]) => {
      const X = x as number, Y = y as number;
      return `<g filter="url(#shadow)"><rect x="${X - 70}" y="${Y}" width="140" height="${H - Y}" fill="${c}"/><path d="M${X - 90} ${Y}L${X} ${Y - 80}L${X + 90} ${Y}z" fill="#5B3A29"/><rect x="${X - 20}" y="${Y + 70}" width="40" height="70" fill="#FFF3D6"/><rect x="${X - 50}" y="${Y + 25}" width="28" height="28" fill="#FFF3D6"/><rect x="${X + 22}" y="${Y + 25}" width="28" height="28" fill="#FFF3D6"/></g>`;
    }).join('');
    const key = `<g filter="url(#shadow)" transform="translate(400 200) rotate(-30) scale(1.5)"><circle r="52" fill="none" stroke="#E2B04A" stroke-width="18"/><rect x="40" y="-9" width="170" height="18" rx="6" fill="#E2B04A"/><rect x="170" y="9" width="16" height="34" fill="#E2B04A"/><rect x="140" y="9" width="16" height="24" fill="#E2B04A"/></g>`;
    return key + sparkles(r, 22, v.dark ? '#FFE6A8' : '#E2B04A', [0, 0, W, 400]) + hills('#9CC98A', 1150, 30, r) + houses;
  },
  retirement: (r, v) => {
    const sun = `<circle cx="450" cy="980" r="190" fill="#FFB347" opacity="0.95"/><circle cx="450" cy="980" r="260" fill="#FFB347" opacity="0.25" filter="url(#blur)"/>`;
    const sea = `<rect x="0" y="1010" width="${W}" height="${H - 1010}" fill="${v.dark ? '#1C3B5A' : '#3E8EBF'}"/>` + Array.from({ length: 10 }, (_, i) => `<rect x="${n(250 + r() * 300)}" y="${1030 + i * 16}" width="${n(80 + r() * 140)}" height="5" rx="3" fill="#FFD9A0" opacity="0.6"/>`).join('');
    const palm = (x: number, flip: number) => `<g fill="${v.dark ? '#0E1A26' : '#24453A'}"><path d="M${x} 1200q${-20 * flip} -180 ${10 * flip} -330l12 2q${-26 * flip} 150 ${-2 * flip} 328z"/>${[0, 1, 2, 3, 4].map((i) => `<path d="M${x + 10 * flip} 870q${(-120 + i * 60) * flip} ${-70 + Math.abs(i - 2) * 30} ${(-200 + i * 100) * flip} ${-10 + Math.abs(i - 2) * 50}q${(90 - i * 45) * flip} -60 ${(200 - i * 100) * flip} 10z"/>`).join('')}</g>`;
    const birds = Array.from({ length: 5 }, () => { const x = 100 + r() * 700, y = 120 + r() * 220; return `<path d="M${n(x)} ${n(y)}q14 -14 28 0q14 -14 28 0" fill="none" stroke="${v.dark ? '#F3E3C8' : '#5B4636'}" stroke-width="5"/>`; }).join('');
    return sun + sea + palm(110, 1) + palm(800, -1) + birds;
  },
  promotion: (r, v) => {
    const arrow = `<g filter="url(#shadow)"><path d="M140 1120L360 960L500 1040L760 820" fill="none" stroke="#2EC4B6" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/><path d="M700 800l90 -10-20 90z" fill="#2EC4B6"/></g>`;
    const stars = Array.from({ length: 5 }, (_, i) => { const x = 210 + i * 120, y = 190 + (i % 2) * 40, s = 40; return `<path d="M${x} ${y - s}l${n(s * 0.3)} ${n(s * 0.7)} ${n(s * 0.75)} ${n(s * 0.05)}-${n(s * 0.58)} ${n(s * 0.48)} ${n(s * 0.2)} ${n(s * 0.75)}-${n(s * 0.67)}-${n(s * 0.42)}-${n(s * 0.67)} ${n(s * 0.42)} ${n(s * 0.2)}-${n(s * 0.75)}-${n(s * 0.58)}-${n(s * 0.48)} ${n(s * 0.75)}-${n(s * 0.05)}z" fill="#FFC845" filter="url(#shadow)"/>`; }).join('');
    return stars + sparkles(r, 20, v.dark ? '#FFE6A8' : '#FFC845', [0, 0, W, 420]) + arrow + confetti(r, 70, ['#2EC4B6', '#FF9F1C', '#E71D36', '#7B61FF'], 860, 1190);
  },
  farewell: (r, v) => {
    const plane = (x: number, y: number, s: number, rot: number, c: string) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" filter="url(#shadow)"><path d="M0 0L90 30L0 60L20 30z" fill="${c}"/><path d="M20 30L90 30L28 44z" fill="#00000022"/></g>`;
    const trail = (d: string) => `<path d="${d}" fill="none" stroke="${v.dark ? '#ffffff66' : '#3E5C7666'}" stroke-width="4" stroke-dasharray="12 12"/>`;
    return trail('M60 360 Q300 120 520 220') + plane(520, 190, 1.4, -15, '#FFFFFF') + trail('M900 1080 Q640 980 520 1060') + plane(430, 1040, 1.1, 190, '#FFD36B') + trail('M0 980 Q200 880 300 930') + plane(300, 900, 0.9, 20, '#9AD8F5') + sparkles(r, 16, v.dark ? '#FFE6A8' : '#7FB2FF', [0, 0, W, H]);
  },
  teacher: (r, v) => {
    const books = [['#E76F51', 260], ['#2A9D8F', 230], ['#E9C46A', 250], ['#7B61FF', 220]].map(([c, w], i) => `<rect x="${450 - (w as number) / 2 + (i % 2) * 14}" y="${1110 - i * 46}" width="${w}" height="44" rx="6" fill="${c}" filter="url(#shadow)"/>`).join('');
    const apple = `<g filter="url(#shadow)" transform="translate(470 880)"><path d="M0 -20c-40 -30 -95 0 -80 55 10 40 40 60 80 45 40 15 70 -5 80 -45 15 -55 -40 -85 -80 -55z" fill="#E63946"/><path d="M0 -20q5 -30 20 -40" stroke="#5B3A29" stroke-width="7" fill="none"/>${leaf(14, -40, 36, 60, '#4CAF50')}</g>`;
    const pencils = Array.from({ length: 6 }, (_, i) => `<g transform="translate(${120 + i * 130} ${120 + (i % 2) * 50}) rotate(${-30 + i * 12})" filter="url(#shadow)"><rect x="-10" y="-80" width="20" height="130" fill="${['#FFC845', '#2EC4B6', '#FF6B6B'][i % 3]}"/><path d="M-10 50l10 26 10-26z" fill="#F3D2A6"/><rect x="-10" y="-96" width="20" height="16" fill="#F28B82"/></g>`).join('');
    const abc = `<text x="160" y="1050" font-family="Georgia, serif" font-size="70" fill="${v.dark ? '#FFE6A8' : '#7B61FF'}" opacity="0.7">A B C</text><text x="610" y="1060" font-family="Georgia, serif" font-size="60" fill="${v.dark ? '#BDE7C9' : '#2A9D8F'}" opacity="0.7">1 2 3</text>`;
    return pencils + abc + books + apple;
  },
  goodluck: (r, v) => {
    const clover = (x: number, y: number, s: number, rot: number) => `<g transform="translate(${n(x)} ${n(y)}) rotate(${n(rot)})" filter="url(#shadow)">${[0, 90, 180, 270].map((a) => `<g transform="rotate(${a})">${heart(0, -s * 0.55, s * 0.5, '#3BB273')}</g>`).join('')}<path d="M0 0q${n(s * 0.2)} ${n(s * 0.6)} ${n(s * 0.5)} ${n(s * 0.9)}" stroke="#2E8B57" stroke-width="${n(s * 0.08)}" fill="none"/></g>`;
    const many = Array.from({ length: 12 }, () => clover(r() * W, r() < 0.5 ? 80 + r() * 300 : 900 + r() * 260, 30 + r() * 40, r() * 360)).join('');
    return many + sparkles(r, 28, v.dark ? '#FFE6A8' : '#FFC845');
  },
  achievement: (r, v) => {
    const trophy = `<g filter="url(#shadow)" transform="translate(450 190)"><path d="M-80 -90h160v60a80 80 0 0 1 -160 0z" fill="#F4C430"/><path d="M-80 -70c-60 0 -60 70 0 70M80 -70c60 0 60 70 0 70" stroke="#F4C430" stroke-width="14" fill="none"/><rect x="-14" y="46" width="28" height="40" fill="#D4A017"/><rect x="-60" y="86" width="120" height="24" rx="6" fill="#8B5E3C"/><path d="M-50 -80q20 60 0 110" stroke="#fff" stroke-width="10" opacity="0.5" fill="none"/></g>`;
    const medals = [220, 450, 680].map((x, i) => `<g filter="url(#shadow)"><path d="M${x - 30} 900l30 80 30-80" fill="${['#E63946', '#457B9D', '#2A9D8F'][i]}"/><circle cx="${x}" cy="1030" r="56" fill="${['#C0C0C0', '#F4C430', '#CD7F32'][i]}"/><circle cx="${x}" cy="1030" r="40" fill="none" stroke="#fff" stroke-width="4" opacity="0.6"/></g>`).join('');
    return trophy + sparkles(r, 22, '#F4C430', [0, 0, W, 430]) + medals + confetti(r, 50, ['#E63946', '#F4C430', '#457B9D', '#2A9D8F'], 1090, 1190);
  },
  halloween: (r, v) => {
    const moon = `<circle cx="680" cy="200" r="120" fill="#FCE6A4"/><circle cx="680" cy="200" r="180" fill="#FCE6A4" opacity="0.25" filter="url(#blur)"/>`;
    const bat = (x: number, y: number, s: number) => `<path transform="translate(${n(x)} ${n(y)}) scale(${n(s)})" d="M0 0c-20-20-50-20-70-5 15 0 25 8 28 20 8-10 20-10 28-2 4-8 8-10 14-13 6 3 10 5 14 13 8-8 20-8 28 2 3-12 13-20 28-20-20-15-50-15-70 5z" fill="#1A1028"/>`;
    const bats = Array.from({ length: 6 }, () => bat(100 + r() * 600, 120 + r() * 250, 0.8 + r() * 0.8)).join('');
    const pumpkin = (x: number, y: number, s: number) => `<g transform="translate(${x} ${y}) scale(${s})" filter="url(#shadow)"><ellipse cx="-40" cy="0" rx="50" ry="60" fill="#E66A1F"/><ellipse cx="40" cy="0" rx="50" ry="60" fill="#E66A1F"/><ellipse cx="0" cy="0" rx="55" ry="64" fill="#F28C28"/><rect x="-6" y="-80" width="12" height="26" rx="4" fill="#4E7D3A"/><path d="M-40 -15l14 -18 14 18zM12 -15l14 -18 14 18zM-40 20q40 30 80 0q-40 12 -80 0z" fill="#2B1300"/></g>`;
    return moon + bats + hills('#2B1C3F', 1080, 50, r) + pumpkin(230, 1080, 1.1) + pumpkin(560, 1100, 0.85) + pumpkin(760, 1070, 0.7) + sparkles(r, 20, '#FCE6A4', [0, 0, W, 500]);
  },
  hanukkah: (r, v) => {
    const blue = '#4A7BD8';
    const base = `<g filter="url(#shadow)"><rect x="200" y="1110" width="500" height="26" rx="10" fill="#C9A227"/><rect x="438" y="960" width="24" height="160" fill="#C9A227"/>${Array.from({ length: 4 }, (_, i) => `<path d="M450 1000q${-60 - i * 50} 0 ${-60 - i * 50} -90" fill="none" stroke="#C9A227" stroke-width="12"/><path d="M450 1000q${60 + i * 50} 0 ${60 + i * 50} -90" fill="none" stroke="#C9A227" stroke-width="12"/>`).join('')}</g>`;
    const xs = [450 - 260, 450 - 210, 450 - 160, 450 - 110, 450 - 60, 450, 450 + 60, 450 + 110, 450 + 160, 450 + 210, 450 + 260].filter((_, i) => i !== 4 && i !== 6);
    const candles = xs.map((x) => { const top = x === 450 ? 860 : 880; return `<rect x="${x - 9}" y="${top}" width="18" height="${910 - top + 2}" fill="${x === 450 ? '#fff' : blue}"/><path d="M${x} ${top - 34}q14 18 0 30q-14 -12 0 -30z" fill="#FFC845"/><circle cx="${x}" cy="${top - 18}" r="22" fill="#FFC845" opacity="0.3" filter="url(#soft)"/>`; }).join('');
    const star = (x: number, y: number, s: number) => `<g transform="translate(${n(x)} ${n(y)}) scale(${n(s)})" fill="none" stroke="#C7D7FF" stroke-width="4" opacity="0.75"><path d="M0 -30L26 15H-26z"/><path d="M0 30L26 -15H-26z"/></g>`;
    const stars = Array.from({ length: 7 }, () => star(80 + r() * 740, 80 + r() * 300, 0.8 + r() * 0.8)).join('');
    return stars + sparkles(r, 24, '#DDE6FF', [0, 0, W, 450]) + base + candles;
  },
  vaisakhi: (r, v) => {
    const field = hills('#E3B23C', 1020, 40, r) + hills('#C9962A', 1090, 30, r);
    const stalk = (x: number, h: number) => `<g><path d="M${n(x)} 1200L${n(x)} ${n(1200 - h)}" stroke="#A8761C" stroke-width="4"/>${Array.from({ length: 6 }, (_, i) => `<ellipse cx="${n(x + (i % 2 ? 9 : -9))}" cy="${n(1200 - h + i * 16)}" rx="7" ry="14" fill="#F6CF5A" transform="rotate(${i % 2 ? 25 : -25} ${n(x)} ${n(1200 - h + i * 16)})"/>`).join('')}</g>`;
    const wheat = Array.from({ length: 26 }, () => stalk(r() * W, 180 + r() * 140)).join('');
    const sun = `<circle cx="450" cy="180" r="110" fill="#FFB703"/><circle cx="450" cy="180" r="180" fill="#FFB703" opacity="0.25" filter="url(#blur)"/>`;
    const dhol = `<g transform="translate(720 220)" filter="url(#shadow)"><rect x="-70" y="-50" width="140" height="100" rx="40" fill="#D62828"/><ellipse cx="-70" cy="0" rx="18" ry="50" fill="#FFE8C2"/><ellipse cx="70" cy="0" rx="18" ry="50" fill="#FFE8C2"/><path d="M-60 -45L60 45M-60 45L60 -45" stroke="#FFC845" stroke-width="5"/></g>`;
    return sun + dhol + confetti(r, 40, ['#D62828', '#FFB703', '#2A9D8F', '#F77F00'], 40, 380) + field + wheat;
  },
  vesak: (r, v) => {
    const lotus = (x: number, y: number, s: number) => `<g transform="translate(${n(x)} ${n(y)}) scale(${n(s)})" filter="url(#shadow)">${[-60, -30, 0, 30, 60].map((a) => `<path d="M0 0C-26 -40 -18 -90 0 -110C18 -90 26 -40 0 0z" fill="${a === 0 ? '#F7A8C0' : '#F9C9D8'}" transform="rotate(${a})"/>`).join('')}<ellipse cx="0" cy="6" rx="80" ry="14" fill="#5DA271"/></g>`;
    const water = `<rect x="0" y="1060" width="${W}" height="${H - 1060}" fill="${v.dark ? '#1B2E4A' : '#9BC9E3'}" opacity="0.9"/>`;
    const lantern = (x: number, y: number, c: string) => `<g filter="url(#shadow)"><line x1="${x}" y1="0" x2="${x}" y2="${y - 50}" stroke="#C9A227" stroke-width="3"/><path d="M${x - 40} ${y - 50}h80l-14 110h-52z" fill="${c}"/><path d="M${x - 40} ${y - 50}l40 -26 40 26" fill="#C9A227"/><circle cx="${x}" cy="${y}" r="70" fill="${c}" opacity="0.25" filter="url(#blur)"/></g>`;
    return [150, 330, 570, 750].map((x, i) => lantern(x, 160 + (i % 2) * 90, ['#FFD166', '#F4A261', '#FFD166', '#F4A261'][i])).join('') + sparkles(r, 22, '#FFF2C6', [0, 0, W, 460]) + water + lotus(260, 1080, 0.9) + lotus(470, 1110, 1.2) + lotus(690, 1085, 0.85);
  },
  ramadan: (r, v) => {
    const moon = `<path d="M560 120a150 150 0 1 0 110 250a120 120 0 1 1 -110 -250z" fill="#FFE6A8"/><circle cx="520" cy="250" r="190" fill="#FFE6A8" opacity="0.18" filter="url(#blur)"/>`;
    const arches = Array.from({ length: 5 }, (_, i) => { const x = 20 + i * 180; return `<path d="M${x} ${H}V1020a70 90 0 0 1 140 0V${H}z" fill="#1C1240" opacity="0.92"/>`; }).join('');
    const lamps = [130, 320, 580, 770].map((x, i) => { const y = 830 + (i % 2) * 60; return `<line x1="${x}" y1="560" x2="${x}" y2="${y - 40}" stroke="#C9A227" stroke-width="3"/><g filter="url(#shadow)"><path d="M${x - 26} ${y - 40}h52l12 60-38 30-38-30z" fill="#F4C430"/><circle cx="${x}" cy="${y}" r="56" fill="#FFC845" opacity="0.3" filter="url(#blur)"/></g>`; }).join('');
    return moon + sparkles(r, 40, '#FFF2C6', [0, 0, W, 600]) + lamps + arches;
  },
  thanksgiving: (r, v) => {
    const colors = ['#D9480F', '#E8590C', '#F59F00', '#A61E4D', '#B5651D'];
    const maple = (x: number, y: number, s: number, rot: number, c: string) => `<path transform="translate(${n(x)} ${n(y)}) rotate(${n(rot)}) scale(${n(s)})" d="M0 -40l8 18 14-6-4 18 18-2-12 14 10 10-22 2 2 14-14-8-14 8 2-14-22-2 10-10-12-14 18 2-4-18 14 6z" fill="${c}"/>`;
    const leaves = Array.from({ length: 40 }, () => maple(r() * W, r() < 0.45 ? 40 + r() * 340 : 900 + r() * 280, 0.9 + r() * 1.3, r() * 360, pick(r, colors))).join('');
    const pumpkin = `<g transform="translate(450 1090)" filter="url(#shadow)"><ellipse cx="-40" cy="0" rx="50" ry="56" fill="#E8590C"/><ellipse cx="40" cy="0" rx="50" ry="56" fill="#E8590C"/><ellipse cx="0" cy="0" rx="55" ry="60" fill="#F76707"/><rect x="-6" y="-74" width="12" height="24" rx="4" fill="#5C940D"/></g>`;
    return leaves + pumpkin;
  },
  sankranti: (r, v) => {
    const kite = (x: number, y: number, s: number, c1: string, c2: string, rot: number) => `<g transform="translate(${n(x)} ${n(y)}) rotate(${n(rot)}) scale(${n(s)})" filter="url(#shadow)"><path d="M0 -70L55 0L0 80L-55 0z" fill="${c1}"/><path d="M0 -70L0 80M-55 0L55 0" stroke="${c2}" stroke-width="4"/><path d="M0 80q-10 20 0 40" stroke="${c2}" stroke-width="3" fill="none"/><path d="M-6 90h12l-6 14z" fill="${c2}"/></g>`;
    const kites = [[150, 200, 1.1, '#E63946', '#FFD166', -15], [380, 120, 0.9, '#2A9D8F', '#F1FAEE', 10], [600, 230, 1.2, '#FFB703', '#8338EC', -5], [780, 110, 0.8, '#8338EC', '#FFD166', 20]].map((k) => kite(k[0] as number, k[1] as number, k[2] as number, k[3] as string, k[4] as string, k[5] as number)).join('');
    const strings = `<path d="M150 290Q300 700 450 1200M380 200Q400 700 450 1200M600 330Q520 800 450 1200M780 190Q620 700 450 1200" stroke="${v.dark ? '#ffffff55' : '#00000033'}" stroke-width="2" fill="none"/>`;
    const pot = `<g transform="translate(450 1080)" filter="url(#shadow)"><ellipse cx="0" cy="40" rx="120" ry="80" fill="#B5651D"/><rect x="-70" y="-50" width="140" height="40" rx="12" fill="#B5651D"/><path d="M-60 -50q-20 -60 20 -80q-10 40 40 40q40 -50 60 0q20 30 -40 40z" fill="#FFF8E7"/><path d="M-110 30h220" stroke="#FFD166" stroke-width="10"/></g>`;
    const cane = (x: number) => `<g><rect x="${x}" y="880" width="18" height="320" rx="6" fill="#7A9A3A"/>${[930, 1010, 1090].map((y) => `<rect x="${x - 2}" y="${y}" width="22" height="6" fill="#5C7A26"/>`).join('')}${leaf(x + 9, 890, 70, -30, '#88B04B')}${leaf(x + 9, 890, 70, 30, '#88B04B')}</g>`;
    return strings + kites + cane(120) + cane(160) + cane(740) + cane(780) + pot;
  },
  pet: (r, v) => {
    const paw = (x: number, y: number, s: number, rot: number, c: string) => `<g transform="translate(${n(x)} ${n(y)}) rotate(${n(rot)}) scale(${n(s)})" fill="${c}"><ellipse cx="0" cy="10" rx="22" ry="18"/><circle cx="-22" cy="-14" r="9"/><circle cx="-8" cy="-24" r="9"/><circle cx="8" cy="-24" r="9"/><circle cx="22" cy="-14" r="9"/></g>`;
    const paws = Array.from({ length: 16 }, (_, i) => paw(80 + (i % 8) * 105, i < 8 ? 110 + (i % 2) * 70 : 1000 + (i % 2) * 90, 1 + r() * 0.3, -20 + r() * 40, pick(r, v.dark ? ['#F3E3C8', '#FFD166'] : ['#8B5E3C', '#C08552', '#E07A5F']))).join('');
    const bone = (x: number, y: number) => `<g transform="translate(${x} ${y}) rotate(-15)" filter="url(#shadow)"><rect x="-70" y="-14" width="140" height="28" rx="14" fill="#FFF8E7"/><circle cx="-70" cy="-14" r="20" fill="#FFF8E7"/><circle cx="-70" cy="14" r="20" fill="#FFF8E7"/><circle cx="70" cy="-14" r="20" fill="#FFF8E7"/><circle cx="70" cy="14" r="20" fill="#FFF8E7"/></g>`;
    return paws + bone(450, 300) + confetti(r, 30, ['#E07A5F', '#81B29A', '#F2CC8F', '#3D405B'], 1120, 1195);
  },
  friendship: (r, v) => {
    const band = (y: number, cols: string[]) => Array.from({ length: 30 }, (_, i) => `<rect x="${i * 30}" y="${y}" width="30" height="56" fill="${cols[i % cols.length]}" transform="skewX(-30)"/>`).join('');
    const bands = `<g filter="url(#shadow)">${band(120, ['#FF595E', '#FFCA3A', '#8AC926', '#1982C4', '#6A4C93'])}</g><g filter="url(#shadow)">${band(1060, ['#6A4C93', '#1982C4', '#8AC926', '#FFCA3A', '#FF595E'])}</g>`;
    const stars = sparkles(r, 30, v.dark ? '#FFE6A8' : '#FFCA3A');
    const hearts = Array.from({ length: 10 }, () => heart(r() * W, r() < 0.5 ? 220 + r() * 160 : 920 + r() * 110, 12 + r() * 18, pick(r, ['#FF595E', '#FFCA3A', '#8AC926', '#1982C4']), 'opacity="0.85"')).join('');
    return bands + stars + hearts;
  },
  thankyou: (r, v) => {
    const fl = Array.from({ length: 6 }, (_, i) => flower(120 + i * 135, 1090 + (i % 2) * 40, 55, pick(r, ['#FFB4A2', '#E5989B', '#FFCDB2', '#B5838D']), '#FFE8A3', 8, r() * 40)).join('');
    const leaves = Array.from({ length: 12 }, () => leaf(r() * W, 1150, 50 + r() * 30, -50 + r() * 100, '#8AB17D')).join('');
    const ribbon = `<g filter="url(#shadow)"><path d="M0 170C250 90 650 250 900 150" stroke="#E5989B" stroke-width="30" fill="none"/><path d="M0 170C250 90 650 250 900 150" stroke="#fff" stroke-width="3" fill="none" opacity="0.6" stroke-dasharray="20 14"/></g>`;
    return ribbon + sparkles(r, 22, v.dark ? '#FFE6A8' : '#E5989B', [0, 0, W, 420]) + leaves + fl;
  },
  remembrance: (r, v) => {
    const candle = (x: number, h: number) => `<g><rect x="${x - 26}" y="${1200 - h}" width="52" height="${h}" rx="8" fill="#F8F1E3"/><path d="M${x} ${1200 - h - 50}q20 26 0 44q-20 -18 0 -44z" fill="#FFC845"/><circle cx="${x}" cy="${1200 - h - 30}" r="60" fill="#FFC845" opacity="0.28" filter="url(#blur)"/></g>`;
    const candles = [[260, 170], [380, 230], [520, 200], [640, 150]].map(([x, h]) => candle(x, h)).join('');
    const petals = Array.from({ length: 14 }, () => `<ellipse cx="${n(r() * W)}" cy="${n(60 + r() * 360)}" rx="9" ry="16" fill="${v.dark ? '#E8D5F2' : '#C9B6E4'}" opacity="${n(0.4 + r() * 0.4)}" transform="rotate(${n(r() * 180)})"/>`).join('');
    const lily = `<g transform="translate(450 220) scale(1.6)" filter="url(#shadow)">${[0, 72, 144, 216, 288].map((a) => `<path d="M0 0C-18 -30 -12 -80 0 -100C12 -80 18 -30 0 0z" fill="${v.dark ? '#FFFFFF' : '#C9B6E4'}" transform="rotate(${a})"/>`).join('')}<circle r="12" fill="#F4E3B2"/></g>`;
    return petals + lily + candles;
  }
};

/* Two looks per occasion: index 1 and 2. `dark` tells cards to use light text. */
const LOOKS: Record<string, [Variant, Variant]> = {
  engagement: [{ dark: false, bg: ['#FFF4F6', '#FDE7EC'], glow: ['#F8A5BC', '#FFE6A8'] }, { dark: true, bg: ['#2B1830', '#47233E'], glow: ['#F06C8F', '#E2B04A'] }],
  babyshower: [{ dark: false, bg: ['#E9F6FF', '#FFF0F5'], glow: ['#9AD8F5', '#F9C0D3'] }, { dark: false, bg: ['#FFF8E6', '#EAF7EE'], glow: ['#FFE29A', '#BDE7C9'] }],
  mothersday: [{ dark: false, bg: ['#FFF3F6', '#FFE3EC'], glow: ['#F7A8C0', '#FFD36B'] }, { dark: true, bg: ['#3A1F33', '#5A2A47'], glow: ['#F27D9F', '#FFD36B'] }],
  fathersday: [{ dark: false, bg: ['#EEF4FF', '#DCE8FF'], glow: ['#7FB2FF', '#FFC845'] }, { dark: true, bg: ['#0F1E3D', '#1E3363'], glow: ['#2F6BD8', '#FFC845'] }],
  grandparents: [{ dark: false, bg: ['#FFF8EE', '#FCEBD7'], glow: ['#F4B183', '#C9A7EB'] }, { dark: true, bg: ['#3B2A22', '#5A3E30'], glow: ['#F4B183', '#F7D08A'] }],
  valentines: [{ dark: false, bg: ['#FFEFF3', '#FFD6E0'], glow: ['#F06C8F', '#FF9AB5'] }, { dark: true, bg: ['#3D0A1E', '#6B1233'], glow: ['#E63B60', '#FF9AB5'] }],
  housewarming: [{ dark: false, bg: ['#EAF6FF', '#FFF7E6'], glow: ['#9AD8F5', '#FFE29A'] }, { dark: true, bg: ['#1B2440', '#2E3B66'], glow: ['#E9C46A', '#F4A261'] }],
  retirement: [{ dark: false, bg: ['#FFE0B5', '#FFC48C'], glow: ['#FFB347', '#FFE6A8'] }, { dark: true, bg: ['#2A1B3D', '#C0604A'], glow: ['#FFB347', '#F28B82'] }],
  promotion: [{ dark: false, bg: ['#F2FFFD', '#E6F4FF'], glow: ['#2EC4B6', '#FFC845'] }, { dark: true, bg: ['#101935', '#22305E'], glow: ['#2EC4B6', '#FFC845'] }],
  farewell: [{ dark: false, bg: ['#EAF4FB', '#FDF6EC'], glow: ['#9AD8F5', '#FFD36B'] }, { dark: true, bg: ['#142A3E', '#29506E'], glow: ['#9AD8F5', '#FFD36B'] }],
  teacher: [{ dark: false, bg: ['#FFFBEA', '#FFF1D6'], glow: ['#FFC845', '#2EC4B6'] }, { dark: true, bg: ['#1F3B2E', '#2E5643'], glow: ['#FFC845', '#BDE7C9'] }],
  goodluck: [{ dark: false, bg: ['#F0FFF4', '#E2F7E9'], glow: ['#3BB273', '#FFC845'] }, { dark: true, bg: ['#0E2A1C', '#16422C'], glow: ['#3BB273', '#FFE6A8'] }],
  achievement: [{ dark: false, bg: ['#FFFBEA', '#FFF0C7'], glow: ['#F4C430', '#E63946'] }, { dark: true, bg: ['#1B1F3B', '#2C3366'], glow: ['#F4C430', '#457B9D'] }],
  halloween: [{ dark: true, bg: ['#1B1030', '#3B1F4F'], glow: ['#F28C28', '#8E44AD'] }, { dark: true, bg: ['#120C1E', '#2D1B3A'], glow: ['#FCE6A4', '#F28C28'] }],
  hanukkah: [{ dark: true, bg: ['#0C1A3D', '#1D3470'], glow: ['#4A7BD8', '#FFC845'] }, { dark: false, bg: ['#F1F5FF', '#DDE6FF'], glow: ['#4A7BD8', '#C9A227'] }],
  vaisakhi: [{ dark: false, bg: ['#FFF4D6', '#FFE2A8'], glow: ['#FFB703', '#F77F00'] }, { dark: false, bg: ['#E8F4FF', '#FFF0CF'], glow: ['#FFB703', '#2A9D8F'] }],
  vesak: [{ dark: true, bg: ['#141E3C', '#2B3A6B'], glow: ['#FFD166', '#F7A8C0'] }, { dark: false, bg: ['#FFF7EC', '#E6F2FA'], glow: ['#FFD166', '#F7A8C0'] }],
  ramadan: [{ dark: true, bg: ['#120B2E', '#2D1C5A'], glow: ['#FFC845', '#7B61FF'] }, { dark: true, bg: ['#082A2E', '#0F4B4F'], glow: ['#FFC845', '#2EC4B6'] }],
  thanksgiving: [{ dark: false, bg: ['#FFF4E6', '#FFE3C2'], glow: ['#F59F00', '#D9480F'] }, { dark: true, bg: ['#2E1A0E', '#4D2B16'], glow: ['#F59F00', '#D9480F'] }],
  sankranti: [{ dark: false, bg: ['#E6F6FF', '#FFF6E0'], glow: ['#FFB703', '#2A9D8F'] }, { dark: false, bg: ['#FFF1E6', '#FFE0C2'], glow: ['#E63946', '#FFD166'] }],
  pet: [{ dark: false, bg: ['#FFF8EE', '#FCEBDC'], glow: ['#E07A5F', '#81B29A'] }, { dark: true, bg: ['#2F2A40', '#3D405B'], glow: ['#F2CC8F', '#81B29A'] }],
  friendship: [{ dark: false, bg: ['#FFFDF2', '#F0F7FF'], glow: ['#FFCA3A', '#1982C4'] }, { dark: true, bg: ['#1E1A3A', '#2E2A5A'], glow: ['#FF595E', '#8AC926'] }],
  thankyou: [{ dark: false, bg: ['#FFF7F3', '#FCE8E1'], glow: ['#E5989B', '#FFE8A3'] }, { dark: true, bg: ['#3A2630', '#57384A'], glow: ['#E5989B', '#FFE8A3'] }],
  remembrance: [{ dark: true, bg: ['#1E1B2E', '#2E2A44'], glow: ['#FFC845', '#C9B6E4'] }, { dark: false, bg: ['#F6F3FA', '#ECE6F4'], glow: ['#C9B6E4', '#FFE8A3'] }]
};

async function main() {
  const only = process.argv.slice(2);
  const out: Record<string, [boolean, boolean]> = {};
  for (const id of Object.keys(SCENES)) {
    if (only.length && !only.includes(id)) continue;
    for (const k of [0, 1] as const) {
      const v = LOOKS[id][k];
      const r = rng(id.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7) + k * 1000);
      const svg = frame(v, SCENES[id](r, v), r);
      await sharp(Buffer.from(svg)).jpeg({ quality: 84, progressive: true, mozjpeg: true }).toFile(path.join('public/art', `${id}-${k + 1}.jpg`));
    }
    out[id] = [LOOKS[id][0].dark, LOOKS[id][1].dark];
  }
  console.log(JSON.stringify(out));
}
main();
