import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/server/db';
import { AppError } from '@/server/errors';
import { pageUser } from '@/server/http';
import { moneyEnabled } from '@/server/services/money';
import { organiserView } from '@/server/services/marketplace';
import { PotActions, TestModeBanner } from '@/components/money/MoneyUI';
import { Icon } from '@/components/Icon';
import { formatMoney } from '@/lib/money';
import { getT } from '@/server/i18n';

export async function generateMetadata() {
  const { t, intl, tp } = await getT();
  return { title: t("Collection") };
}

export default async function Pot({ params }: { params: Promise<{ id: string }> }) {
  const { t, intl, tp } = await getT();
  const user = await pageUser();
  if (!moneyEnabled()) notFound();
  const v = await organiserView(getDb(), user.id, (await params).id).catch((e) => { if (e instanceof AppError && e.status === 404) notFound(); throw e; });
  const c = v.collection;
  const link = `${process.env.APP_URL ?? ''}/p/${c.slug}`;
  const pct = c.target ? Math.min(100, Math.round((v.raised / c.target) * 100)) : null;
  return (
    <div className="stack-lg" style={{ maxWidth: 820 }}>
      <header className="row"><Link href="/pots" className="btn btn-ghost btn-sm" aria-label={t("Back")}><Icon name="back" size={18} /></Link><h1>{c.title}</h1></header>
      <TestModeBanner />
      <section className="card-box stack">
        <p style={{ margin: 0, fontSize: 22 }}>{tp(v.contributions.length, "{raised} raised from {n} person", "{raised} raised from {n} people", { raised: formatMoney(v.raised, c.currency) })}{c.target ? ` · ${t("target {v}", { v: formatMoney(c.target, c.currency) })}` : ''}</p>
        {pct !== null && <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t("Progress")}><span style={{ width: `${pct}%` }} /></div>}
        <div className="link-box"><span className="grow" data-testid="pot-link" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link}</span><a className="btn btn-sm" href={`https://wa.me/?text=${encodeURIComponent(`${c.title} — chip in here: ${link}`)}`} target="_blank" rel="noopener noreferrer">{t("WhatsApp")}</a></div>
        {v.charity ? <p className="small" style={{ margin: 0 }}>{t("Donations go directly to")}{' '}<b>{v.charity.name}</b>.</p> : <PotActions id={c.id} closed={!!c.closedAt} balance={v.balance} />}
        {v.payouts.length > 0 && <ul className="list small">{v.payouts.map((p) => <li key={p.id} className="item">{formatMoney(p.amount, p.currency)} · {p.status}{p.reference ? t(" · ref {reference}", { reference: p.reference }) : ''} · {p.createdAt.toLocaleDateString(intl)}</li>)}</ul>}
      </section>
      <section className="stack"><h2>{t("Contributions")}</h2>
        {v.contributions.length === 0 ? <p className="muted">{t("None yet — share the link.")}</p> : (
          <div className="table-wrap"><table className="table"><thead><tr><th>{t("From")}</th><th>{t("Amount")}</th><th>{t("Message")}</th></tr></thead><tbody>
            {v.contributions.map((x) => <tr key={x.id}><td>{x.name}{x.anonymous ? t(" (anonymous to others)") : ''}<br /><span className="muted small">{x.email}</span></td><td>{formatMoney(x.amount, x.currency)}</td><td className="small">{x.message}</td></tr>)}
          </tbody></table></div>
        )}
      </section>
    </div>
  );
}
