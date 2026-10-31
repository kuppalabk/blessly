import { getDb } from '@/server/db';
import { listAffiliates, listPromos } from '@/server/services/promotions';
import { PromotionsAdmin } from '@/components/admin/PromotionsAdmin';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Promotions', robots: { index: false } };

export default async function AdminPromotions() {
  const db = getDb();
  const [promos, affiliates] = await Promise.all([listPromos(db), listAffiliates(db)]);
  return (
    <PromotionsAdmin
      promos={promos.map(({ p, partner, used, saved }) => ({
        id: p.id, code: p.code, label: p.label, kind: p.kind, value: p.value, currency: p.currency, appliesTo: p.appliesTo,
        minAmount: p.minAmount, maxRedemptions: p.maxRedemptions, perUserLimit: p.perUserLimit, active: p.active,
        endsAt: p.endsAt ? p.endsAt.toISOString() : null, partner: partner ?? null, used, saved
      }))}
      affiliates={affiliates.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() }))}
    />
  );
}
