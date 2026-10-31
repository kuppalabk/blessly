import { cfg } from '@/server/settings';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { pageUser } from '@/server/http';
import { subscriptions } from '@/server/schema';
import { formatPrice } from '@/server/services/billing';
import { TestPay } from './TestPay';
import { getT } from '@/server/i18n';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("Test checkout"), robots: { index: false } };
}

/** Only in BILLING_TEST_MODE: stands in for the Razorpay/Stripe payment page. */
export default async function TestCheckout({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const { t } = await getT();
  if (cfg('BILLING_TEST_MODE') !== '1') notFound();
  const user = await pageUser();
  const id = (await searchParams).s ?? '';
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const s = await getDb().query.subscriptions.findFirst({ where: and(eq(subscriptions.id, id), eq(subscriptions.userId, user.id)) });
  if (!s) notFound();
  return (
    <div className="card-box stack" style={{ maxWidth: 440, margin: '0 auto' }}>
      <p className="eyebrow">{t("Test payment — no real money")}</p>
      <h1>{s.planId === 'family' ? t("Family plan") : t("Business plan")}</h1>
      <p><b>{formatPrice(s.amount, s.currency as 'INR' | 'USD')}</b> / {s.interval}</p>
      <TestPay id={s.id} />
    </div>
  );
}
