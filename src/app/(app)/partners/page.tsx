import { notFound } from 'next/navigation';
import { getDb } from '@/server/db';
import { pageUser } from '@/server/http';
import { account, moneyEnabled } from '@/server/services/money';
import { myPartnerships } from '@/server/services/marketplace';
import { AddProductForm, DesignSubmit, PartnerApply, PayoutButton, SellerOrderActions, TestModeBanner, UploadButton } from '@/components/money/MoneyUI';
import { currencyFor, formatMoney } from '@/lib/money';
import { getT } from '@/server/i18n';
import { msg } from '@/lib/i18n/ui';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("Partners") };
}
const KINDS = [['seller', msg('Seller')], ['designer', msg('Card designer')], ['charity', msg('Charity')]] as const;
const STATUS: Record<string, string> = { pending: msg('Waiting for review'), approved: msg('Approved'), rejected: msg('Not approved'), suspended: msg('Suspended') };

export default async function Partners() {
  const { t } = await getT();
  const user = await pageUser();
  if (!moneyEnabled()) notFound();
  const mine = await myPartnerships(getDb(), user.id);
  return (
    <div className="stack-lg" style={{ maxWidth: 900 }}>
      <header><h1>{t("Sell, design or fundraise")}</h1><p className="muted small" style={{ margin: 0 }}>{t("Every account is reviewed by Blessly before it goes live.")}</p></header>
      <TestModeBanner />
      {KINDS.map(([kind, label]) => {
        const m = mine.find((x) => x.partner.kind === kind);
        if (!m || m.partner.status === 'rejected') return (
          <section key={kind} className="stack">
            {m && <p className="error">{t("Your application ({kind}) wasn’t approved.", { kind: t(label) })}{m.partner.reviewNote ? ` ${m.partner.reviewNote}` : ''} {t("You can apply again.")}</p>}
            <PartnerApply kind={kind} country={user.country} />
          </section>
        );
        const p = m.partner;
        return (
          <section key={kind} className="card-box stack" aria-label={`${label}: ${p.name}`}>
            <div className="row between"><h2 style={{ margin: 0 }}>{t(label)}: {p.name}</h2><span className={`badge ${p.status === 'approved' ? 'badge-green' : ''}`}>{t(STATUS[p.status])}</span></div>
            {p.status === 'approved' && (
              <div className="row-wrap">
                <span className="small">{t("Balance:")}{' '}{Object.entries(m.balance).map(([c, v]) => formatMoney(v, c)).join(' · ') || formatMoney(0, currencyFor(user.country))}</span>
                {Object.entries(m.balance).filter(([, v]) => v > 0).map(([c, v]) => <PayoutButton key={c} account={account.partner(p.id)} currency={c} amount={v} />)}
              </div>
            )}
            {m.payouts.length > 0 && <p className="small muted" style={{ margin: 0 }}>{t("Payouts:")}{' '}{m.payouts.map((x) => `${formatMoney(x.amount, x.currency)} ${x.status}`).join(' · ')}</p>}
            {kind === 'seller' && p.status === 'approved' && (
              <>
                <h3 style={{ margin: 0 }}>{t("Products")}</h3>
                <ul className="list">{m.products.map((x) => (
                  <li key={x.id} className="item" style={{ flexWrap: 'wrap' }}>
                    {x.imageUrl ? <img src={x.imageUrl} alt="" width={48} height={48} style={{ borderRadius: 8, objectFit: 'cover' }} /> : <span aria-hidden>🎁</span>}
                    <span className="grow"><b>{x.title}</b><br /><span className="muted small">{x.priceText} · {t("{n} in stock", { n: x.stock })} · {x.status === 'approved' ? t("live") : x.status === 'pending' ? t("waiting for review") : t("not approved")}</span></span>
                    <UploadButton url={`/api/partners/products/${x.id}`} field="photo" label={t("Photo")} />
                  </li>
                ))}</ul>
                <AddProductForm currency={currencyFor(user.country)} />
                <h3 style={{ margin: 0 }}>{t("Orders to send")}</h3>
                {m.orders.length === 0 ? <p className="muted small">{t("No orders yet.")}</p> : (
                  <ul className="list">{m.orders.map((o) => {
                    const a = o.details.address as Record<string, string>;
                    return <li key={o.id} className="item" style={{ flexWrap: 'wrap' }}><span className="grow"><b>{String(o.details.title)}</b> · {o.amount}<br /><span className="small">{[a.name, a.line1, a.line2, a.city, a.state, a.postcode, a.country].filter(Boolean).join(', ')}</span>{o.details.giftMessage ? <><br /><span className="small">{t("Gift note: “{v}”", { v: String(o.details.giftMessage) })}</span></> : null}</span><SellerOrderActions id={o.id} status={o.status} /></li>;
                  })}</ul>
                )}
              </>
            )}
            {kind === 'designer' && p.status === 'approved' && (
              <>
                <DesignSubmit />
                <div className="grid-cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
                  {m.designs.map((d) => <figure key={d.id} style={{ margin: 0 }}><img src={d.imageUrl} alt={d.title} style={{ width: '100%', borderRadius: 10 }} /><figcaption className="small">{d.title} · {d.status === 'approved' ? t("used {uses}×", { uses: d.uses }) : d.status}</figcaption></figure>)}
                </div>
              </>
            )}
            {kind === 'charity' && p.status === 'approved' && (
              m.donations.length === 0 ? <p className="muted small">{t("No donations yet. Fundraisers can now choose {name}.", { name: p.name })}</p> : <ul className="list">{m.donations.map((d, i) => <li key={i} className="item small">{d.name} · {d.amount} · {d.fundraiser}</li>)}</ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
