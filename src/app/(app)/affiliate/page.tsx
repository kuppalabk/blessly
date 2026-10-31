import { notFound } from 'next/navigation';
import { getDb } from '@/server/db';
import { pageUser } from '@/server/http';
import { moneyEnabled } from '@/server/services/money';
import { affiliateDashboard } from '@/server/services/promotions';
import { TestModeBanner } from '@/components/money/MoneyUI';
import { CopyLink, JoinAffiliate } from '@/components/money/AffiliateUI';
import { formatMoney } from '@/lib/money';
import { getT } from '@/server/i18n';
import { msg } from '@/lib/i18n/ui';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("Partner programme") };
}
const STATUS: Record<string, string> = { pending: msg('Waiting for review'), approved: msg('Approved'), paused: msg('Paused'), rejected: msg('Not approved') };
const totals = (m: Record<string, number>) => Object.entries(m).map(([c, v]) => formatMoney(v, c)).join(' · ') || '—';

export default async function AffiliatePage() {
  const { t, intl } = await getT();
  const user = await pageUser();
  if (!moneyEnabled()) notFound();
  const d = await affiliateDashboard(getDb(), user.id);
  const link = `${process.env.APP_URL ?? ''}/r/${d?.affiliate.code ?? ''}`;
  return (
    <div className="stack-lg" style={{ maxWidth: 760 }}>
      <h1>{t("Partner programme")}</h1>
      <TestModeBanner />
      <p className="muted">{t("Share your link or code. Your friends get a discount, and you earn a share of every purchase they make.")}</p>
      {!d && <section className="card-box stack"><JoinAffiliate /></section>}
      {d && (
        <>
          <section className="card-box stack">
            <p><b>{t("Your application:")}</b> {t(STATUS[d.affiliate.status] ?? d.affiliate.status)}</p>
            {d.affiliate.status === 'pending' && <p className="muted small">{t("We’ll let you know when it’s approved. Your code starts working then.")}</p>}
            {d.affiliate.status === 'approved' && (
              <>
                <p className="small"><b>{t("Your link")}</b></p>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <code style={{ wordBreak: 'break-all' }}>{link}</code> <CopyLink value={link} />
                </div>
                <p className="small"><b>{t("Your code")}</b>: <code>{d.affiliate.code}</code>{d.promo ? ` · ${t("customers save {v}%", { v: d.promo.kind === 'percent' ? d.promo.value : 0 })}` : ''}</p>
                <p className="muted small">{t("You earn {v}% of what each referred customer pays.", { v: d.affiliate.commissionPercent })}</p>
              </>
            )}
          </section>
          <section className="stats" aria-label={t("Your results")}>
            <div className="stat"><span className="muted small">{t("People referred")}</span><b>{d.referrals}</b></div>
            <div className="stat"><span className="muted small">{t("Purchases")}</span><b>{d.sales}</b></div>
            <div className="stat"><span className="muted small">{t("Waiting to be paid")}</span><b>{totals(d.pending)}</b></div>
            <div className="stat"><span className="muted small">{t("Paid to you")}</span><b>{totals(d.paid)}</b></div>
          </section>
          <section className="card-box stack">
            <h2 style={{ fontSize: 18 }}>{t("Recent earnings")}</h2>
            {d.recent.length === 0 ? <p className="muted small">{t("No earnings yet.")}</p> : (
              <ul className="list">{d.recent.map((c) => (
                <li key={c.id} className="item"><span className="grow"><b>{formatMoney(c.amount, c.currency)}</b><br /><span className="muted small">{t("from a {v} purchase", { v: formatMoney(c.saleAmount, c.currency) })} · {new Date(c.createdAt).toLocaleDateString(intl)}</span></span>
                  <span className={`badge ${c.status === 'paid' ? 'badge-green' : ''}`}>{c.status === 'pending' ? t("Waiting") : c.status === 'paid' ? t("Paid") : t("Cancelled")}</span></li>
              ))}</ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
