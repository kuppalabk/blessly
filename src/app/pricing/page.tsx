import Link from 'next/link';
import { getDb } from '@/server/db';
import { listPlans } from '@/server/services/billing';
import { PlanCards } from '@/components/billing/PlanCards';
import { getT } from '@/server/i18n';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t('Pricing'), description: t('Blessly is free for personal reminders and wishes. Family and Business plans add bigger family circles, albums and automatic customer wishes on WhatsApp.') };
}
export const dynamic = 'force-dynamic';

export default async function Pricing() {
  const { t } = await getT();
  const plans = await listPlans(getDb());
  return (
    <main style={{ maxWidth: 1040, margin: '0 auto', padding: '32px 16px 64px' }} className="stack-lg">
      <Link href="/" className="brand">{t("Blessly")}</Link>
      <header style={{ textAlign: 'center' }} className="stack"><h1>{t("Simple pricing")}</h1><p className="muted">{t("Free for personal wishes. Upgrade for your whole family or your business.")}</p></header>
      <PlanCards plans={plans} defaultCurrency="INR" />
      <p className="small muted" style={{ textAlign: 'center' }}><Link href="/terms">{t("Terms")}</Link> · <Link href="/privacy">{t("Privacy")}</Link></p>
    </main>
  );
}
