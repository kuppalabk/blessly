import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getDb } from '@/server/db';
import { pageUser } from '@/server/http';
import { getMyBusiness, listCustomers } from '@/server/services/business';
import { dm } from '@/components/business/ui';
import { getT } from '@/server/i18n';

export async function generateMetadata() {
  const { t, tp } = await getT();
  return { title: t("Customers") };
}
const PAGE = 50;

export default async function Customers({ searchParams }: { searchParams: Promise<{ q?: string; tag?: string; page?: string }> }) {
  const { t, intl, tp } = await getT();
  const user = await pageUser();
  const b = await getMyBusiness(getDb(), user.id);
  if (!b) redirect('/business');
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.page) || 0);
  const { customers, total } = await listCustomers(getDb(), b.id, { q: sp.q, tag: sp.tag, limit: PAGE, offset: page * PAGE });
  const qs = (p: number) => `?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.tag ? { tag: sp.tag } : {}), page: String(p) })}`;
  return (
    <section className="stack">
      <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <h2>{tp(total, "{n} customer", "{n} customers", { n: total.toLocaleString() })}</h2>
        <div className="row" style={{ gap: 8 }}>
          <Link href="/business/customers/import" className="btn btn-ghost btn-sm">{t("Import CSV")}</Link>
          <Link href="/business/customers/new" className="btn btn-sm">{t("Add customer")}</Link>
        </div>
      </div>
      <form className="row" style={{ gap: 8 }} role="search">
        <label className="grow"><span className="sr-only">{t("Search customers")}</span><input className="input" type="search" name="q" defaultValue={sp.q} placeholder={t("Search name, phone or email")} /></label>
        <label><span className="sr-only">{t("Tag")}</span><input className="input" name="tag" defaultValue={sp.tag} placeholder={t("Tag")} style={{ width: 110 }} /></label>
        <button className="btn btn-ghost">{t("Search")}</button>
      </form>
      {customers.length === 0 ? (
        <div className="card-box stack"><p className="muted">{sp.q || sp.tag ? t("No customers match.") : t("No customers yet. Add them one by one or import a spreadsheet.")}</p></div>
      ) : (
        <ul className="list">
          {customers.map((c) => {
            const dates = [dm(c.birthdayMonth, c.birthdayDay, intl) && `🎂 ${dm(c.birthdayMonth, c.birthdayDay, intl)}`, dm(c.anniversaryMonth, c.anniversaryDay, intl) && `💍 ${dm(c.anniversaryMonth, c.anniversaryDay, intl)}`].filter(Boolean).join(' · ');
            return (
              <li key={c.id}><Link className="item" href={`/business/customers/${c.id}`}>
                <span className="grow" style={{ minWidth: 0 }}><b>{c.name}</b><br /><span className="muted small">{[c.phone && `+${c.phone}`, c.email].filter(Boolean).join(' · ')}</span>{dates && <><br /><span className="small">{dates}</span></>}</span>
                <span className="stack" style={{ gap: 4, alignItems: 'flex-end' }}>
                  {!c.consentAt ? <span className="badge">{t("No consent")}</span> : c.waOptOutAt && c.emailOptOutAt ? <span className="badge">{t("Unsubscribed")}</span> : <span className="badge badge-green">{t("Can message")}</span>}
                  {c.tags && <span className="muted small">{c.tags.split(',').join(', ')}</span>}
                </span>
              </Link></li>
            );
          })}
        </ul>
      )}
      {(page > 0 || (page + 1) * PAGE < total) && (
        <div className="row between">
          {page > 0 ? <Link className="btn btn-ghost btn-sm" href={qs(page - 1)}>{t("Previous")}</Link> : <span />}
          {(page + 1) * PAGE < total && <Link className="btn btn-ghost btn-sm" href={qs(page + 1)}>{t("Next")}</Link>}
        </div>
      )}
    </section>
  );
}
