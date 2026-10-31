/**
 * Codemod: wraps user-visible English in t('…') across components and pages.
 *   npx tsx scripts/i18n/wrap.ts [--dry] [files…]
 * - JSX text; text mixed with simple values becomes one phrase with {placeholders}
 * - placeholder / aria-label / title / alt / label / confirmText attributes
 * - string branches of ?: and && inside JSX, and messages passed to setError/setMsg/new Error/confirm
 * Adds `const { t } = useT()` (client) or `const { t } = await getT()` (server) to each component.
 */
import ts from 'typescript';
import { readFileSync, writeFileSync } from 'node:fs';
import { globSync } from 'node:fs';

const ATTRS = new Set(['placeholder', 'aria-label', 'title', 'alt', 'label', 'confirmText', 'caption']);
const MSG_CALLS = new Set(['setError', 'setMsg', 'setDone', 'confirm', 'Error', 'ApiError']);
const SKIP = [/\/admin\//, /\/api\//, /I18n\.tsx$/, /GreetingCard\.tsx$/, /LegalPage\.tsx$/, /\/privacy\//, /\/terms\//, /layout\.tsx$/, /RegisterSW/, /\.ics\//];
const hasWords = (s: string) => /\p{L}{2,}/u.test(s);

type Edit = { start: number; end: number; text: string; owner: ts.Node | null };

function jsxTextValue(raw: string) {
  // JSX whitespace rules (simplified): text with line breaks is trimmed per line and joined with spaces.
  let s = raw;
  if (/\n/.test(s)) {
    const lines = s.split(/\r?\n/);
    s = lines.map((l, i) => (i === 0 ? l.replace(/\s+$/, '') : i === lines.length - 1 ? l.replace(/^\s+/, '') : l.trim())).filter((l, i, a) => l.length || (i > 0 && i < a.length - 1 && false)).join(' ');
  }
  return s.replace(/&apos;/g, '’').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/[ \t]+/g, ' ');
}
const lit = (s: string) => JSON.stringify(s);

function topLevelOwner(n: ts.Node): ts.Node | null {
  let cur: ts.Node = n;
  while (cur.parent && !ts.isSourceFile(cur.parent)) cur = cur.parent;
  return ts.isSourceFile(cur.parent) ? cur : null;
}
function ownerFunction(stmt: ts.Node): { fn: ts.FunctionLikeDeclaration; name: string } | null {
  if (ts.isFunctionDeclaration(stmt) && stmt.body) return { fn: stmt, name: stmt.name?.text ?? 'default' };
  if (ts.isVariableStatement(stmt)) {
    const d = stmt.declarationList.declarations[0];
    if (d && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer)) && ts.isIdentifier(d.name)) return { fn: d.initializer, name: d.name.text };
  }
  return null;
}

function simpleExpr(e: ts.Expression): boolean {
  if (ts.isIdentifier(e) || ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e) || ts.isNumericLiteral(e)) return true;
  if (ts.isCallExpression(e)) return e.arguments.every((a) => !containsJsxOrString(a)) && !containsJsxOrString(e.expression);
  if (ts.isNonNullExpression(e) || ts.isParenthesizedExpression(e)) return simpleExpr(e.expression);
  return false;
}
function containsJsxOrString(n: ts.Node): boolean {
  let found = false;
  const visit = (x: ts.Node) => { if (ts.isJsxElement(x) || ts.isJsxSelfClosingElement(x) || ts.isJsxFragment(x) || (ts.isStringLiteral(x) && hasWords(x.text)) || ts.isNoSubstitutionTemplateLiteral(x) || ts.isTemplateExpression(x)) found = true; else ts.forEachChild(x, visit); };
  visit(n);
  return found;
}
function placeholderName(e: ts.Expression, used: Set<string>): string {
  let base: string = ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : ts.isNonNullExpression(e) || ts.isParenthesizedExpression(e) ? placeholderName(e.expression, new Set()) : 'v';
  if (!/^[A-Za-z_]\w*$/.test(base)) base = 'v';
  let name: string = base, i = 2;
  while (used.has(name)) name = `${base}${i++}`;
  used.add(name);
  return name;
}

export function transform(file: string, src: string, T = 't') {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits: Edit[] = [];
  const done = new Set<ts.Node>();
  const wrapStr = (n: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral) => { if (hasWords(n.text) && !done.has(n)) { done.add(n); edits.push({ start: n.getStart(sf), end: n.getEnd(), text: `${T}(${lit(n.text)})`, owner: topLevelOwner(n) }); } };
  const wrapTemplate = (e: ts.TemplateExpression) => {
    if (done.has(e) || !e.templateSpans.every((sp) => simpleExpr(sp.expression))) return;
    const used = new Set<string>(); const vars: string[] = [];
    let phrase = e.head.text;
    for (const sp of e.templateSpans) {
      const name = placeholderName(sp.expression, used);
      vars.push(name === sp.expression.getText(sf) ? name : `${name}: ${sp.expression.getText(sf)}`);
      phrase += `{${name}}` + sp.literal.text;
    }
    if (!hasWords(phrase.replace(/\{\w+\}/g, ''))) return;
    done.add(e);
    edits.push({ start: e.getStart(sf), end: e.getEnd(), text: `${T}(${lit(phrase)}, { ${vars.join(', ')} })`, owner: topLevelOwner(e) });
  };
  const wrapBranches = (e: ts.Expression): void => {
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return wrapStr(e);
    if (ts.isTemplateExpression(e)) return wrapTemplate(e);
    if (ts.isParenthesizedExpression(e)) return wrapBranches(e.expression);
    if (ts.isConditionalExpression(e)) { wrapBranches(e.whenTrue); wrapBranches(e.whenFalse); return; }
    if (ts.isBinaryExpression(e) && (e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken || e.operatorToken.kind === ts.SyntaxKind.BarBarToken || e.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)) { wrapBranches(e.right); if (e.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken) wrapBranches(e.left); }
  };

  const visit = (n: ts.Node) => {
    if (ts.isJsxElement(n) || ts.isJsxFragment(n)) {
      const tag = ts.isJsxElement(n) ? n.openingElement.tagName.getText(sf) : '';
      if (['code', 'pre', 'style', 'script'].includes(tag)) return;
      const kids = n.children.filter((c) => !(ts.isJsxText(c) && !c.text.trim()));
      const texts = kids.filter((c): c is ts.JsxText => ts.isJsxText(c) && hasWords(c.text));
      const mixable = texts.length > 0 && kids.every((c) => ts.isJsxText(c) || (ts.isJsxExpression(c) && (!c.expression || simpleExpr(c.expression))));
      if (mixable && kids.some((c) => ts.isJsxExpression(c) && c.expression)) {
        const used = new Set<string>();
        const vars: string[] = [];
        let phrase = '';
        for (const c of n.children) {
          if (ts.isJsxText(c)) phrase += jsxTextValue(c.text);
          else if (ts.isJsxExpression(c) && c.expression) {
            const name = placeholderName(c.expression, used);
            phrase += `{${name}}`;
            vars.push(name === c.expression.getText(sf) ? name : `${name}: ${c.expression.getText(sf)}`);
          }
        }
        const trimmed = phrase.trim();
        const first = n.children[0], last = n.children[n.children.length - 1];
        edits.push({ start: first.getStart(sf), end: last.getEnd(), text: `{${T}(${lit(trimmed)}, { ${vars.join(', ')} })}`, owner: topLevelOwner(n) });
        n.children.forEach((c) => done.add(c));
      }
    }
    if (ts.isJsxText(n) && !done.has(n) && hasWords(n.text)) {
      const parentTag = ts.isJsxElement(n.parent) ? n.parent.openingElement.tagName.getText(sf) : '';
      if (!['code', 'pre', 'style'].includes(parentTag)) {
        const raw = n.text;
        const v = jsxTextValue(raw);
        const lead = /^[ \t]+\S/.test(raw) && !/^\s*\n/.test(raw) ? "{' '}" : '';
        const trail = /\S[ \t]+$/.test(raw) && !/\n\s*$/.test(raw) ? "{' '}" : '';
        edits.push({ start: n.getStart(sf), end: n.getEnd(), text: `${lead}{${T}(${lit(v.trim())})}${trail}`, owner: topLevelOwner(n) });
      }
    }
    if (ts.isJsxAttribute(n) && n.initializer) {
      const name = n.name.getText(sf);
      if (ATTRS.has(name)) {
        if (ts.isStringLiteral(n.initializer) && hasWords(n.initializer.text)) edits.push({ start: n.initializer.getStart(sf), end: n.initializer.getEnd(), text: `{${T}(${lit(n.initializer.text)})}`, owner: topLevelOwner(n) });
        else if (ts.isJsxExpression(n.initializer) && n.initializer.expression) wrapBranches(n.initializer.expression);
      }
      // Other attributes (className, href…) are never wrapped themselves, but handlers inside them are visited.
      if (!n.initializer || !ts.isJsxExpression(n.initializer)) return;
      ts.forEachChild(n.initializer, visit);
      return;
    }
    if (ts.isJsxExpression(n) && n.expression && !ts.isJsxAttribute(n.parent)) wrapBranches(n.expression);
    if ((ts.isCallExpression(n) || ts.isNewExpression(n)) && n.arguments?.length) {
      const callee = ts.isIdentifier(n.expression) ? n.expression.text : ts.isPropertyAccessExpression(n.expression) ? n.expression.name.text : '';
      if (MSG_CALLS.has(callee)) {
        const a = n.arguments[callee === 'ApiError' ? 1 : 0];
        if (a && ts.isStringLiteral(a)) wrapStr(a);
        else if (a && callee !== 'ApiError') wrapBranches(a);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { sf, edits };
}

function apply(file: string, dry: boolean) {
  let src = readFileSync(file, 'utf8');
  const client = /^\s*['"]use client['"]/.test(src);
  // Pick a name that isn't already used for something else in this file.
  const T = /\b(const|let|var)\s+t\b|[(,]\s*t\s*[),:=]|\(t\)\s*=>|\bt\s*=>/.test(src) ? 'tr' : 't';
  const { sf, edits } = transform(file, src, T);
  if (!edits.length) return { file, n: 0, skipped: 0 };
  // Decide, per top-level owner, how to get t (or skip if it isn't a component).
  const owners = new Map<ts.Node, { inject: string | null; asyncAt: number | null; exprBody: ts.Expression | null }>();
  let skipped = 0;
  for (const e of edits) {
    if (!e.owner || owners.has(e.owner)) continue;
    const of = ownerFunction(e.owner);
    if (!of) { owners.set(e.owner, { inject: null, asyncAt: null, exprBody: null }); continue; }
    const isComponent = /^[A-Z]/.test(of.name) || (client && /^use[A-Z]/.test(of.name)) || of.name === 'default' || (ts.isFunctionDeclaration(e.owner) && !!e.owner.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword));
    const isAsync = !!of.fn.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
    if (client && !isComponent) { owners.set(e.owner, { inject: null, asyncAt: null, exprBody: null }); continue; }
    if (!client && !isComponent && !isAsync) { owners.set(e.owner, { inject: null, asyncAt: null, exprBody: null }); continue; }
    const body = of.fn.body!;
    const inject = client ? `const { t${T === 't' ? '' : ': tr'} } = useT();` : `const { t${T === 't' ? '' : ': tr'} } = await getT();`;
    const asyncAt = !client && !isAsync ? (ts.isFunctionDeclaration(of.fn) ? of.fn.getStart(sf) + (of.fn.modifiers?.length ? of.fn.modifiers.map((m) => m.getText(sf)).join(' ').length + 1 : 0) : of.fn.getStart(sf)) : null;
    owners.set(e.owner, { inject, asyncAt, exprBody: ts.isBlock(body) ? null : (body as ts.Expression) });
  }
  const kept = edits.filter((e) => e.owner && owners.get(e.owner)?.inject);
  skipped = edits.length - kept.length;
  const all: { start: number; end: number; text: string }[] = kept.map((e) => ({ start: e.start, end: e.end, text: e.text }));
  for (const [owner, o] of owners) {
    if (!o.inject || !kept.some((e) => e.owner === owner)) continue;
    const of = ownerFunction(owner)!;
    if (src.slice(of.fn.body!.getStart(sf), of.fn.body!.getStart(sf) + 200).includes('useT()') || src.slice(of.fn.body!.getStart(sf), of.fn.body!.getStart(sf) + 200).includes('getT()')) continue;
    if (o.asyncAt !== null) all.push({ start: o.asyncAt, end: o.asyncAt, text: 'async ' });
    if (o.exprBody) {
      all.push({ start: o.exprBody.getStart(sf), end: o.exprBody.getStart(sf), text: `{ ${o.inject} return ` });
      all.push({ start: o.exprBody.getEnd(), end: o.exprBody.getEnd(), text: '; }' });
    } else {
      const b = of.fn.body as ts.Block;
      all.push({ start: b.getStart(sf) + 1, end: b.getStart(sf) + 1, text: `\n  ${o.inject}` });
    }
  }
  // Import.
  const imp = client ? "import { useT } from '@/components/I18n';" : "import { getT } from '@/server/i18n';";
  if (!src.includes(imp)) {
    const lastImport = sf.statements.filter(ts.isImportDeclaration).pop();
    const at = lastImport ? lastImport.getEnd() : client ? src.indexOf('\n') + 1 : 0;
    all.push({ start: at, end: at, text: `${lastImport ? '\n' : ''}${imp}${lastImport ? '' : '\n'}` });
  }
  all.sort((a, b) => b.start - a.start || b.end - a.end);
  // Overlapping edits: keep the outermost (it already covers the inner text).
  const final: typeof all = [];
  for (const e of all) { if (final.some((f) => e.start < f.end && e.end > f.start && !(e.start === e.end || f.start === f.end))) continue; final.push(e); }
  for (const e of final) src = src.slice(0, e.start) + e.text + src.slice(e.end);
  if (!dry) writeFileSync(file, src);
  return { file, n: kept.length, skipped };
}

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const files = args.filter((a) => !a.startsWith('--'));
const list = files.length ? files : [...globSync('src/app/**/*.tsx'), ...globSync('src/components/**/*.tsx')].filter((f) => !SKIP.some((r) => r.test(f)));
let total = 0, skippedTotal = 0;
for (const f of list) {
  const r = apply(f, dry);
  total += r.n; skippedTotal += r.skipped;
  if (r.n || r.skipped) console.log(`${String(r.n).padStart(4)} wrapped${r.skipped ? `, ${r.skipped} left (not in a component)` : ''}  ${f}`);
}
console.log(`\n${total} strings wrapped, ${skippedTotal} left for manual review, ${list.length} files`);
