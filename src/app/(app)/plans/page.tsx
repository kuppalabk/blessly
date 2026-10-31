import { getDb } from '@/server/db';
import { pageUser } from '@/server/http';
import { entitlements, listPlans } from '@/server/services/billing';
import { PlanCards } from '@/components/billing/PlanCards';
import { getT } from '@/server/i18n';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("Plans") };
}

export default async function Plans({ searchParams }: { searchParams: Promise<{ paid?: string; cancelled?: string }> }) {
  const { t } = await getT();
  const user = await pageUser();
  const sp = await searchParams;
  const ent = await entitlements(getDb(), user.id);
  const plans = await listPlans(getDb());
  return (
    <div className="stack-lg" style={{ maxWidth: 1000 }}>
      <header><h1>{t("Plans")}</h1><p className="muted">{t("You’re on")}{' '}<b>{ent.plan.name}</b>{ent.subscription?.status === 'past_due' ? t(" — your last payment failed; please update your payment method") : ''}.</p></header>
      {sp.paid && ent.plan.id === 'free' && <p className="notice" role="status">{t("Thanks! Your plan switches on as soon as the payment is confirmed — usually within a few seconds. Refresh this page in a moment.")}</p>}
      {sp.paid && ent.plan.id !== 'free' && <p className="notice" role="status">{t("Thank you — you’re on {name}.", { name: ent.plan.name })}</p>}
      {sp.cancelled && <p className="notice">{t("Payment cancelled. You haven’t been charged.")}</p>}
      <PlanCards plans={plans} defaultCurrency={user.country === 'IN' ? 'INR' : 'USD'} currentPlan={ent.plan.id}
        cancelAtPeriodEnd={!!ent.subscription?.cancelAtPeriodEnd || ent.subscription?.status === 'cancelled'} periodEnd={ent.subscription?.currentPeriodEnd?.toISOString() ?? null} />
    </div>
  );
}
