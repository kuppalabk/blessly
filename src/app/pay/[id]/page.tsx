import { notFound } from 'next/navigation';
import { getDb } from '@/server/db';
import { getPayment, moneyEnabled } from '@/server/services/money';
import { TestCheckout } from '@/components/money/MoneyUI';
import { formatMoney } from '@/lib/money';
import { getT } from '@/server/i18n';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("Checkout (test mode)"), robots: { index: false } };
}
export const dynamic = 'force-dynamic';

export default async function Pay({ params }: { params: Promise<{ id: string }> }) {
  if (!moneyEnabled()) notFound();
  const p = await getPayment(getDb(), (await params).id).catch(() => null);
  if (!p) notFound();
  return <main style={{ padding: '40px 16px' }}><TestCheckout id={p.id} description={p.description} amount={formatMoney(p.amount, p.currency)!} status={p.status} returnUrl={p.returnUrl} /></main>;
}
