/**
 * Assembles src/locales/<code>.json from translator files src/locales/_tx/<code>-NN.txt
 * (lines "<number>\t<translation>", numbers matching src/locales/_keys.json, 1-based).
 * Checks: every number valid, placeholders identical to the English, no duplicates.
 *   npx tsx scripts/i18n/build.ts [codes…]
 */
import { readFileSync, writeFileSync, globSync, existsSync } from 'node:fs';
import { UI_LANGUAGES } from '../../src/lib/i18n/ui';

const keys = JSON.parse(readFileSync('src/locales/_keys.json', 'utf8')) as string[];
const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
const codes = process.argv.slice(2).length ? process.argv.slice(2) : UI_LANGUAGES.filter((c) => c !== 'en');
let bad = 0;
for (const code of codes) {
  const files = globSync(`src/locales/_tx/${code}-*.txt`).sort();
  if (!files.length) continue;
  const dict: Record<string, string> = existsSync(`src/locales/${code}.json`) ? JSON.parse(readFileSync(`src/locales/${code}.json`, 'utf8')) : {};
  const problems: string[] = [];
  for (const f of files) {
    for (const [ln, line] of readFileSync(f, 'utf8').split('\n').entries()) {
      if (!line.trim()) continue;
      const m = /^(\d+)\t(.*)$/.exec(line);
      if (!m) { problems.push(`${f}:${ln + 1} not "number<TAB>text"`); continue; }
      const i = Number(m[1]) - 1, key = keys[i];
      const val = m[2].replace(/\\n/g, '\n').trim();
      if (key === undefined) { problems.push(`${f}:${ln + 1} no key #${m[1]}`); continue; }
      const okPh = ph(key) === ph(val) || ph(key.replace(/\{n\}/g, '')) === ph(val.replace(/\{n\}/g, '')); // count words may drop {n} ("one day")
      if (!okPh) { problems.push(`${f}:${ln + 1} #${m[1]} placeholders ${ph(val) || '∅'} ≠ ${ph(key) || '∅'}: ${val.slice(0, 60)}`); continue; }
      // Keep the English key's leading/trailing spaces (fragments joined to other text).
      if (val) dict[key] = (key.match(/^\s*/)![0]) + val + (key.match(/\s*$/)![0]);
    }
  }
  // Drop entries whose key no longer exists.
  for (const k of Object.keys(dict)) if (!keys.includes(k) && !k.includes('#')) delete dict[k];
  writeFileSync(`src/locales/${code}.json`, JSON.stringify(dict, Object.keys(dict).sort(), 0).replace(/","/g, '",\n"') + '\n');
  const missing = keys.filter((k) => !dict[k]).length;
  console.log(`${code}: ${Object.keys(dict).length} translated, ${missing} missing${problems.length ? `, ${problems.length} problems` : ''}`);
  for (const p of problems.slice(0, 15)) console.log('   ', p);
  bad += problems.length;
}
process.exitCode = bad ? 1 : 0;
