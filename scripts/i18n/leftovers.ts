/** Lists English that is still not wrapped in t(): template literals and string literals with words, outside t() calls and non-visible attributes. */
import ts from 'typescript';
import { readFileSync, globSync } from 'node:fs';
const SKIP = [/\/admin\//, /\/api\//, /I18n\.tsx$/, /GreetingCard\.tsx$/, /LegalPage\.tsx$/, /\/privacy\//, /\/terms\//, /RegisterSW/, /\.ics\//];
const IGNORE_ATTR = new Set(['className', 'href', 'src', 'key', 'type', 'name', 'role', 'id', 'rel', 'target', 'accept', 'autoComplete', 'inputMode', 'method', 'data-testid', 'htmlFor', 'dir', 'lang', 'as', 'action', 'fill', 'd', 'viewBox', 'width', 'height', 'xmlns', 'preload', 'crossOrigin', 'loading', 'decoding', 'value', 'defaultValue', 'icon', 'variant', 'field', 'url', 'kind', 'data-v', 'data-channel', 'pattern', 'mode', 'exact', 'titleAs']);
const words = (s: string) => /[A-Za-z]{3,}\s+[A-Za-z]{2,}/.test(s) || /^[A-Z][a-z]{2,}[a-z ]*[.!?…]?$/.test(s);
const files = [...globSync('src/app/**/*.tsx'), ...globSync('src/components/**/*.tsx')].filter((f) => !SKIP.some((r) => r.test(f)));
let total = 0;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[] = [];
  const inT = (n: ts.Node) => { for (let p = n.parent; p; p = p.parent) { if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && ['t', 'tr', 'tp', 'msg'].includes(p.expression.text)) return true; if (ts.isJsxAttribute(p) && IGNORE_ATTR.has(p.name.getText(sf))) return true; if (ts.isImportDeclaration(p)) return true; if (ts.isCallExpression(p) && /fetch|api|router\.|push|replace|setItem|getItem|querySelector|startsWith|includes|test|match|split|join|toLocale|DateTimeFormat|NumberFormat|URLSearchParams|encodeURIComponent|append|get$|set$|set\(|cookies|redirect|notFound/.test(p.expression.getText(sf))) return true; } return false; };
  const visit = (n: ts.Node) => {
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && words(n.text) && !inT(n)) out.push(`  ${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}: ${n.getText(sf).slice(0, 110)}`);
    else if (ts.isTemplateExpression(n) && !inT(n) && words(n.getText(sf).replace(/\$\{[^}]*\}/g, ' '))) out.push(`  ${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}: ${n.getText(sf).slice(0, 110)}`);
    else if (ts.isJsxText(n) && /[A-Za-z]{2,}/.test(n.text)) out.push(`  ${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}: JSX ${n.text.trim().slice(0, 100)}`);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (out.length) { console.log(`${f} (${out.length})`); console.log(out.join('\n')); total += out.length; }
}
console.log(`\n${total} left`);
