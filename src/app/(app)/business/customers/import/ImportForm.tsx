'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/components/api';
import { useT } from '@/components/I18n';

type Result = { added: number; updated: number; skipped: { row: number; reason: string }[] };
const SAMPLE = 'name,mobile,email,birthday,anniversary,language,tags\nNisha Kapoor,+91 98765 43210,nisha@example.com,12/11,,en,vip\nAnil Rao,+44 7700 900123,,14 Mar,14 Feb,hi,regular\n';

export function ImportForm() {
  const { t, tp } = useT();
  const router = useRouter();
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const rows = csv.trim() ? csv.trim().split(/\r?\n/).length - 1 : 0;
  return (
    <div className="stack-lg">
      <div className="card-box stack">
        <p className="small">{t("Columns we understand:")}{' '}<span className="code">{t("name")}</span> {' '}{t("(required),")}{' '}<span className="code">{t("mobile")}</span> {' '}{t("or")}{' '}<span className="code">{t("whatsapp")}</span>, <span className="code">{t("email")}</span>, <span className="code">{t("birthday")}</span>, <span className="code">{t("anniversary")}</span>, <span className="code">{t("language")}</span>, <span className="code">{t("tags")}</span>{t(". Dates like 14/03, 14 Mar or 1990-03-14 (day first). Existing customers with the same mobile or email are updated.")}</p>
        <a className="small" href={`data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE)}`} download="blessly-customers.csv">{t("Download a sample file")}</a>
        <label className="field">{t("Spreadsheet (.csv)")}<input className="input" style={{ paddingTop: 10 }} type="file" accept=".csv,text/csv" aria-label={t("CSV file")} onChange={async (e) => {
            const f = e.target.files?.[0]; setResult(null); setError(null);
            if (!f) return;
            if (f.size > 2_000_000) { setError(t("The file is too big (2 MB max).")); return; }
            setFileName(f.name); setCsv(await f.text());
          }} />
        </label>
        <label className="field">{t("…or paste it here")}<textarea className="textarea" aria-label={t("CSV text")} value={csv} onChange={(e) => { setCsv(e.target.value); setFileName(null); setResult(null); }} placeholder={SAMPLE} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13 }} />
        </label>
        {rows > 0 && <p className="small muted">{fileName ? `${fileName}: ` : ''}{tp(rows, "{n} row", "{n} rows", { n: rows.toLocaleString() })}</p>}
        <label className="check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span><b>{t("Everyone in this file agreed to receive messages from my business")}</b><br /><span className="muted small">{t("For example they signed up in store, on your website or at checkout. WhatsApp can block numbers that message people without permission.")}</span></span>
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn" disabled={busy || !csv.trim()} onClick={async () => {
          setBusy(true); setError(null); setResult(null);
          try { setResult(await api<Result>('/api/business/customers/import', { body: { csv, consent } })); router.refresh(); }
          catch (e) { setError(e instanceof Error ? e.message : t("Import failed")); }
          setBusy(false);
        }}>{busy ? t("Importing…") : t("Import customers")}</button>
      </div>
      {result && (
        <section className="card-box stack" role="status" aria-label={t("Import result")}>
          <h2>{t("Import finished")}</h2>
          <p>{t("{added} added · {updated} updated · {skipped} skipped", { added: result.added, updated: result.updated, skipped: result.skipped.length })}</p>
          {result.skipped.length > 0 && <ul className="small stack" style={{ gap: 4, paddingLeft: 18, margin: 0 }}>{result.skipped.slice(0, 50).map((s) => <li key={s.row}>{t("Row {row}: {reason}", { row: s.row, reason: s.reason })}</li>)}</ul>}
          <Link className="btn btn-ghost" href="/business/customers">{t("See customers")}</Link>
        </section>
      )}
    </div>
  );
}
