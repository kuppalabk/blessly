import { notFound } from 'next/navigation';
import { getDb } from '@/server/db';
import { pageUser } from '@/server/http';
import { moneyEnabled } from '@/server/services/money';
import { myOrders } from '@/server/services/marketplace';
import { TestModeBanner } from '@/components/money/MoneyUI';
import { getT } from '@/server/i18n';
import { msg } from '@/lib/i18n/ui';

export async function generateMetadata() {
  const { t, intl } = await getT();
  return { title: t("My orders") };
}
const STATUS: Record<string, string> = { paid: msg('Paid'), in_production: msg('Printing'), shipped: msg('On its way'), delivered: msg('Delivered'), refunded: msg('Refunded'), failed: msg('Payment failed'), cancelled: msg('Cancelled') };

export default async function Orders({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { t, intl } = await getT();
  const user = await pageUser();
  if (!moneyEnabled()) notFound();
  const sp = await searchParams;
  const list = await myOrders(getDb(), user.id);
  return (
    <div className="stack-lg" style={{ maxWidth: 760 }}>
      <h1>{t("My orders")}</h1>
      <TestModeBanner />
      {sp.paid && <p className="notice" role="status">{t("Thank you — your order is confirmed.")}</p>}
      {sp.payment === 'failed' && <p className="error" role="alert">{t("The payment didn’t go through. Nothing was taken.")}</p>}
      {list.length === 0 ? <p className="muted">{t("No orders yet.")}</p> : (
        <ul className="list">{list.map((o) => (
          <li key={o.id} className="item"><span aria-hidden style={{ fontSize: 24 }}>{o.kind === 'giftcard' ? '💳' : o.kind === 'print' ? '✉️' : '🛍️'}</span>
            <span className="grow"><b>{o.title}</b><br /><span className="muted small">{o.amount} · {new Date(o.createdAt).toLocaleDateString(intl)}{o.tracking ? t(" · tracking {tracking}", { tracking: o.tracking }) : ''}</span></span>
            <span className={`badge ${o.status === 'delivered' ? 'badge-green' : ''}`}>{t(STATUS[o.status] ?? o.status)}</span></li>
        ))}</ul>
      )}
    </div>
  );
}
