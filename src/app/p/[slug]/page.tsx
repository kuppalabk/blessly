import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/server/db';
import { AppError } from '@/server/errors';
import { currentUser } from '@/server/http';
import { moneyEnabled } from '@/server/services/money';
import { publicCollection } from '@/server/services/marketplace';
import { ContributeForm, TestModeBanner } from '@/components/money/MoneyUI';
import { formatMoney } from '@/lib/money';
import { getT } from '@/server/i18n';

export const dynamic = 'force-dynamic';
async function load(slug: string) {
  if (!moneyEnabled()) notFound();
  return publicCollection(getDb(), slug).catch((e) => { if (e instanceof AppError && e.status === 404) notFound(); throw e; });
}
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const v = await load((await params).slug);
  return { title: v.collection.title, robots: { index: false } };
}

export default async function PublicPot({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { t, intl, tp } = await getT();
  const { slug } = await params;
  const sp = await searchParams;
  const v = await load(slug);
  const c = v.collection;
  const viewer = await currentUser();
  const pct = c.target ? Math.min(100, Math.round((v.raised / c.target) * 100)) : null;
  return (
    <main className="stack-lg" style={{ maxWidth: 620, margin: '0 auto', padding: '28px 16px 48px' }}>
      <TestModeBanner />
      {sp.thanks && <p className="notice" role="status">{c.kind === 'fundraiser' ? t("Thank you! Your donation has been received.") : t("Thank you! Your contribution has been received.")}</p>}
      {sp.payment === 'failed' && <p className="error" role="alert">{t("The payment didn’t go through. Nothing was taken — please try again.")}</p>}
      <header className="stack" style={{ gap: 6 }}>
        <p className="eyebrow" style={{ margin: 0 }}>{c.kind === 'fundraiser' ? t("Fundraiser · organised by {name}", { name: c.organiser }) : t("Group gift · organised by {name}", { name: c.organiser })}</p>
        <h1 style={{ margin: 0 }}>{c.title}</h1>
        {c.item && <p className="muted" style={{ margin: 0 }}>{t("Towards: {title}", { title: c.item.title })}</p>}
        {c.charity && <p className="small" style={{ margin: 0 }}>💚 <b>{c.charity.name}</b> · {t("registered charity {number} ({country})", { number: c.charity.regNumber, country: c.charity.country })}</p>}
      </header>
      <section className="card-box stack">
        <p style={{ margin: 0, fontSize: 22 }}>{tp(v.count, "{raised} from {n} person", "{raised} from {n} people", { raised: formatMoney(v.raised, c.currency) })}{c.target ? <span className="muted"> · {t("target {v}", { v: formatMoney(c.target, c.currency) })}</span> : null}</p>
        {pct !== null && <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t("Progress")}><span style={{ width: `${pct}%` }} /></div>}
        {c.deadline && <p className="muted small" style={{ margin: 0 }}>{t("Closes")}{' '}{new Date(c.deadline).toLocaleDateString(intl, { day: 'numeric', month: 'long' })}</p>}
        {c.story && <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{c.story}</p>}
      </section>
      {c.open ? <section className="card-box stack" aria-labelledby="give"><h2 id="give">{c.kind === 'fundraiser' ? t("Donate") : t("Chip in")}</h2><ContributeForm slug={slug} currency={c.currency} defaultName={viewer?.name ?? ''} kind={c.kind} /></section> : <p className="notice">{t("This collection has closed.")}</p>}
      {v.supporters.length > 0 && (
        <section className="stack"><h2>{t("Supporters")}</h2>
          <ul className="list">{v.supporters.map((s, i) => <li key={i} className="item"><span className="grow"><b>{s.name}</b>{s.message ? <><br /><span className="small">{s.message}</span></> : null}</span>{s.amount !== null && <b>{formatMoney(s.amount, c.currency)}</b>}</li>)}</ul>
        </section>
      )}
      <p className="small" style={{ textAlign: 'center' }}><Link href="/">{t("Blessly")}</Link></p>
    </main>
  );
}
