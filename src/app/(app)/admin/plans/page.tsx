import { cfg } from '@/server/settings';
import { getDb } from '@/server/db';
import { formatPrice, listPlans, revenueSummary } from '@/server/services/billing';
import { PlanEditor } from './PlanEditor';

export const dynamic = 'force-dynamic';

export default async function AdminPlans() {
  const plans = await listPlans(getDb());
  const rev = await revenueSummary(getDb());
  const live = { razorpay: !!(cfg('RAZORPAY_KEY_ID') && cfg('RAZORPAY_KEY_SECRET')), stripe: !!cfg('STRIPE_SECRET_KEY'), test: cfg('BILLING_TEST_MODE') === '1' };
  return (
    <>
      <section className="stats" aria-label="Revenue">
        <div className="stat"><span className="muted small">Paying subscribers</span><b>{rev.paying}</b><span className="muted small">{rev.byPlan.family} Family · {rev.byPlan.business} Business</span></div>
        <div className="stat"><span className="muted small">Monthly revenue (INR)</span><b>{formatPrice(rev.monthly.INR, 'INR')}</b><span className="muted small">yearly plans ÷ 12</span></div>
        <div className="stat"><span className="muted small">Monthly revenue (USD)</span><b>{formatPrice(rev.monthly.USD, 'USD')}</b></div>
        <div className="stat"><span className="muted small">Payment failing</span><b>{rev.pastDue}</b><span className="muted small">in the 7-day grace period</span></div>
      </section>
      <p className="small">Payments: Razorpay (India) <b>{live.razorpay ? 'on' : 'off'}</b> · Stripe (international) <b>{live.stripe ? 'on' : 'off'}</b>{live.test ? ' · test mode on' : ''}</p>
      <div className="two-col">{plans.map((p) => <PlanEditor key={p.id} plan={p} />)}</div>
    </>
  );
}
