import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getDb } from '@/server/db';
import { pageUser } from '@/server/http';
import { getMyBusiness, recentMessages } from '@/server/services/business';
import { fmtDateTime, SOURCE_LABEL, STATUS_LABEL, StatusBadge } from '@/components/business/ui';
import { getT } from '@/server/i18n';

export async function generateMetadata() {
  const { t, intl } = await getT();
  return { title: t("Messages") };
}
const FILTERS = ['', 'sent', 'delivered', 'read', 'failed', 'skipped', 'queued'];

export default async function Messages({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const { t, intl } = await getT();
  const user = await pageUser();
  const b = await getMyBusiness(getDb(), user.id);
  if (!b) redirect('/business');
  const sp = await searchParams;
  const status = FILTERS.includes(sp.status ?? '') ? sp.status ?? '' : '';
  const page = Math.max(0, Number(sp.page) || 0);
  const rows = await recentMessages(getDb(), b.id, { status: status || undefined, limit: 51, offset: page * 50 });
  return (
    <section className="stack">
      <div className="row-wrap" role="group" aria-label={t("Filter by status")}>
        {FILTERS.map((f) => <Link key={f || 'all'} href={f ? `?status=${f}` : '?'} className="chip" aria-pressed={status === f} style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>{f ? STATUS_LABEL[f] : t("All")}</Link>)}
      </div>
      {rows.length === 0 ? <p className="muted">{t("No messages")}{status ? t(" with status “{v}”", { v: t(STATUS_LABEL[status]) }) : ''}.</p> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t("Customer")}</th><th>{t("Message")}</th><th>{t("Status")}</th><th>{t("When")}</th></tr></thead>
            <tbody>
              {rows.slice(0, 50).map(({ m, customerName }) => (
                <tr key={m.id}>
                  <td>{m.customerId ? <Link href={`/business/customers/${m.customerId}`}>{customerName}</Link> : t("Deleted customer")}<br /><span className="muted small">{m.channel === 'whatsapp' ? t("WhatsApp +{recipient}", { recipient: m.recipient }) : m.recipient}</span></td>
                  <td style={{ minWidth: 180 }}><span className="small">{t(SOURCE_LABEL[m.source])}</span>{m.preview && <><br /><span className="muted small">{m.preview.slice(0, 90)}{m.preview.length > 90 ? '…' : ''}</span></>}{m.error && <><br /><span className="small" style={{ color: m.status === 'failed' ? 'var(--danger)' : 'var(--muted)' }}>{m.error}</span></>}</td>
                  <td><StatusBadge status={m.status} /></td>
                  <td className="small" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(m.sentAt ?? m.createdAt, b.timezone, intl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="row between">
        {page > 0 ? <Link className="btn btn-ghost btn-sm" href={`?${new URLSearchParams({ status, page: String(page - 1) })}`}>{t("Newer")}</Link> : <span />}
        {rows.length > 50 && <Link className="btn btn-ghost btn-sm" href={`?${new URLSearchParams({ status, page: String(page + 1) })}`}>{t("Older")}</Link>}
      </div>
    </section>
  );
}
