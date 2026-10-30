import Link from 'next/link';
import { getDb } from '@/server/db';
import { pageUser } from '@/server/http';
import { dashboard, getMyBusiness, listAutomations, publicBusiness, upcomingCustomerDates } from '@/server/services/business';
import { fmtDateTime, SOURCE_LABEL, StatusBadge } from '@/components/business/ui';
import { Icon } from '@/components/Icon';
import { SetupBusiness } from './SetupBusiness';
import { getT } from '@/server/i18n';

export async function generateMetadata() {
  const { t, intl } = await getT();
  return { title: t("Business") };
}

export default async function BusinessHome() {
  const { t, intl } = await getT();
  const user = await pageUser();
  const raw = await getMyBusiness(getDb(), user.id);
  if (!raw) {
    return (
      <>
        <header><p className="eyebrow">{t("Blessly for business")}</p><h1>{t("Wish every customer, automatically")}</h1></header>
        <section className="hero stack">
          <ul className="stack small" style={{ margin: 0, paddingLeft: 18, gap: 8, color: '#E4E1EC' }}>
            <li>{t("Birthday and anniversary wishes go out by themselves on the day — on WhatsApp from your own business number, or by email")}</li>
            <li>{t("Festival campaigns to all customers or a group (Diwali, Eid, Christmas…)")}</li>
            <li>{t("Import customers from a spreadsheet; see what was delivered and read")}</li>
            <li>{t("Uses WhatsApp’s official Business Platform. Customers can reply STOP at any time")}</li>
          </ul>
        </section>
        <SetupBusiness timezone={user.timezone} country={user.country} />
      </>
    );
  }
  const b = publicBusiness(raw);
  const d = await dashboard(getDb(), raw);
  const autos = await listAutomations(getDb(), b.id);
  const soon = await upcomingCustomerDates(getDb(), raw, 7);
  const count = (statuses: string[]) => d.byStatus.filter((s) => statuses.includes(s.status)).reduce((a, s) => a + s.n, 0);
  const pct = Math.min(100, Math.round((d.used / Math.max(1, d.quota)) * 100));
  const steps = [
    { done: d.customers > 0, label: 'Add or import customers', href: '/business/customers' },
    { done: b.waConnected, label: 'Connect your WhatsApp Business number (or use email only)', href: '/business/settings' },
    { done: autos.some((a) => a.enabled), label: 'Switch on birthday wishes', href: '/business/automations' }
  ];
  return (
    <>
      {d.allowance === 'trial' && <p className="notice">{t("Free trial: {n} messages until {date}.", { n: d.quota, date: d.trialEndsAt?.toISOString().slice(0, 10) })} <Link href="/plans">{t("Choose the Business plan")}</Link> {' '}{t("to keep wishing customers after that.")}</p>}
      {d.allowance === 'none' && <p className="notice" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>{t("Your free trial has ended, so nothing is being sent.")}{' '}<Link href="/plans">{t("Choose the Business plan")}</Link> {' '}{t("to start again.")}</p>}
      {steps.some((s) => !s.done) && (
        <section className="card-box stack" aria-label={t("Getting started")}>
          <h2>{t("Getting started")}</h2>
          <ol className="list" style={{ gap: 6 }}>
            {steps.map((s) => (
              <li key={s.label}><Link href={s.href} className="item" style={{ padding: '10px 12px' }}>
                <span className={`badge ${s.done ? 'badge-green' : ''}`} style={{ minWidth: 28, textAlign: 'center' }}>{s.done ? '✓' : '·'}</span>
                <span className="grow" style={s.done ? { color: 'var(--muted)', textDecoration: 'line-through' } : undefined}>{s.label}</span><Icon name="next" size={16} />
              </Link></li>
            ))}
          </ol>
        </section>
      )}
      <section className="stats" aria-label={t("This month")}>
        <div className="stat"><span className="muted small">{t("Sent this month")}</span><b>{d.used.toLocaleString()}</b><div className="progress" style={{ marginTop: 8 }} aria-label={t("{used} of {quota} messages used", { used: d.used, quota: d.quota })}><span style={{ width: `${pct}%`, background: pct > 90 ? 'var(--accent)' : undefined }} /></div><span className="muted small">{t("of {v} in your plan", { v: d.quota.toLocaleString() })}</span></div>
        <div className="stat"><span className="muted small">{t("Delivered / read")}</span><b>{count(['delivered', 'read']).toLocaleString()}</b><span className="muted small">{t("{n} read on WhatsApp", { n: count(['read']) })}</span></div>
        <div className="stat"><span className="muted small">{t("Failed or not sent")}</span><b>{count(['failed', 'skipped']).toLocaleString()}</b><Link href="/business/messages?status=failed" className="small">{t("See why")}</Link></div>
        <div className="stat"><span className="muted small">{t("Customers")}</span><b>{d.customers.toLocaleString()}</b><span className="muted small">{t("{consented} agreed to messages", { consented: d.consented })}</span></div>
      </section>
      <div className="two-col">
        <section className="stack" aria-labelledby="soon">
          <h2 id="soon">{t("Next 7 days")}</h2>
          {soon.length === 0 && <p className="muted">{t("No customer birthdays or anniversaries this week.")}</p>}
          <ul className="list">
            {soon.slice(0, 8).map((s) => (
              <li key={s.customer.id + s.kind}><Link className="item" href={`/business/customers/${s.customer.id}`}>
                <span className="grow"><b>{s.customer.name}</b><br /><span className="muted small">{s.kind === 'birthday' ? t("Birthday") : t("Anniversary")}{!s.customer.consentAt ? t(" · no consent — won’t be messaged") : ''}</span></span>
                <span className={`badge ${s.inDays === 0 ? 'badge-hot' : ''}`}>{s.inDays === 0 ? t("Today") : s.inDays === 1 ? t("Tomorrow") : t("{inDays} days", { inDays: s.inDays })}</span>
              </Link></li>
            ))}
          </ul>
        </section>
        <section className="stack" aria-labelledby="recent">
          <div className="row between"><h2 id="recent">{t("Recent messages")}</h2><Link href="/business/messages" className="small" style={{ fontWeight: 700 }}>{t("All")}</Link></div>
          {d.recent.length === 0 && <p className="muted">{t("Nothing sent yet.")}</p>}
          <ul className="list">
            {d.recent.map(({ m, customerName }) => (
              <li key={m.id} className="item">
                <span className="grow"><b>{customerName ?? t("Deleted customer")}</b><br /><span className="muted small">{t(SOURCE_LABEL[m.source])} · {m.channel === 'whatsapp' ? t("WhatsApp") : t("Email")} · {fmtDateTime(m.createdAt, b.timezone, intl)}</span></span>
                <StatusBadge status={m.status} />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
