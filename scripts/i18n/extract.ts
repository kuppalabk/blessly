/**
 * Collects every interface string to translate → src/locales/_keys.json (and reports what each language is missing).
 *   npx tsx scripts/i18n/extract.ts
 * Sources: t()/tr()/tp()/msg() calls; user-facing server messages (badRequest, AppError, zod messages…);
 * occasion and occasion-group names.
 */
import ts from 'typescript';
import { globSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { OCCASIONS } from '../../src/lib/i18n-data';
import { OCCASION_GROUPS } from '../../src/lib/occasion-groups';
import { UI_LANGUAGES } from '../../src/lib/i18n/ui';

const keys = new Set<string>();
/** Not text to translate: paths, bare placeholders, URLs. */
const skip = (s: string) => /^[/{][^\s]*$/.test(s.trim()) || /^https?:/.test(s.trim());
const add = (s: string) => { if (/\p{L}/u.test(s.replace(/\{\w+\}/g, '')) && !skip(s)) keys.add(s); };

/** Template literal → key with {v1}… placeholders (matches what translateMessage expects). */
function templateKey(n: ts.TemplateExpression, sf: ts.SourceFile) {
  let s = n.head.text;
  n.templateSpans.forEach((sp, i) => {
    const e = sp.expression;
    const name = ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : `v${i + 1}`;
    s += `{${/^\w+$/.test(name) ? name : `v${i + 1}`}}` + sp.literal.text;
  });
  void sf;
  return s;
}
const textOf = (n: ts.Node | undefined, sf: ts.SourceFile): string | null => {
  if (!n) return null;
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
  if (ts.isTemplateExpression(n)) return templateKey(n, sf);
  return null;
};

const UI = [...globSync('src/app/**/*.tsx'), ...globSync('src/components/**/*.tsx'), ...globSync('src/lib/**/*.ts')].filter((f) => !/\/admin\//.test(f));
const SERVER = [...globSync('src/server/**/*.ts'), ...globSync('src/app/api/**/*.ts')].filter((f) => !/\/admin\//.test(f) && !/admin\.ts$/.test(f));

for (const f of UI) {
  const sf = ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n)) {
      const name = ts.isIdentifier(n.expression) ? n.expression.text : ts.isPropertyAccessExpression(n.expression) ? n.expression.name.text : '';
      if (['t', 'tr', 'msg'].includes(name)) { const s = textOf(n.arguments[0], sf); if (s) add(s); }
      if (name === 'tp') { for (const a of n.arguments.slice(1, 3)) { const s = textOf(a, sf); if (s) add(s); } }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

const MSG_FNS = new Set(['badRequest', 'notFound', 'planLimit', 'forbidden', 'min', 'max', 'email', 'regex', 'refine', 'length', 'url', 'uuid', 'literal']);
for (const f of SERVER) {
  const sf = ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const visit = (n: ts.Node) => {
    if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'AppError') { const s = textOf(n.arguments?.[2], sf); if (s) add(s); }
    if (ts.isCallExpression(n)) {
      const name = ts.isIdentifier(n.expression) ? n.expression.text : ts.isPropertyAccessExpression(n.expression) ? n.expression.name.text : '';
      if (MSG_FNS.has(name)) for (const a of n.arguments) { const s = textOf(a, sf); if (s && /\s/.test(s) && /^[A-Z]/.test(s)) add(s); }
    }
    if (ts.isPropertyAssignment(n) && n.name.getText(sf) === 'message') { const s = textOf(n.initializer, sf); if (s && /^[A-Z]/.test(s)) add(s); }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

for (const o of OCCASIONS) add(o.label);
for (const g of OCCASION_GROUPS) add(g.label);

const list = [...keys].sort((a, b) => a.localeCompare(b));
writeFileSync('src/locales/_keys.json', JSON.stringify(list, null, 1) + '\n');
console.log(`${list.length} strings`);
for (const code of UI_LANGUAGES.filter((c) => c !== 'en')) {
  const file = `src/locales/${code}.json`;
  const dict = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>) : {};
  const missing = list.filter((k) => !dict[k]);
  if (missing.length) console.log(`  ${code}: ${missing.length} missing`);
}
