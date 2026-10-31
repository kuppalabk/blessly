import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { currentUser, readJson, route } from '@/server/http';
import { assertAdmin, audit } from '@/server/services/admin';
import * as M from '@/server/services/marketplace';
import * as $ from '@/server/services/money';

/** action: review | refund | payout */
export const POST = route(async (req: Request) => {
  const a = await currentUser();
  assertAdmin(a);
  const b = (await readJson(req)) as { action?: string; what?: 'partner' | 'product' | 'design'; id?: string; decision?: 'approved' | 'rejected' | 'suspended'; note?: string; approve?: boolean; reference?: string };
  const id = String(b.id ?? '');
  if (b.action === 'review' && b.what && b.decision) {
    await M.review(getDb(), b.what, id, b.decision, b.note?.slice(0, 500) || null);
    await audit(getDb(), a, `money.${b.what}.${b.decision}`, { type: b.what, id }, b.note);
  } else if (b.action === 'refund') {
    await $.refundPayment(getDb(), id);
    await audit(getDb(), a, 'money.refund', { type: 'payment', id });
  } else if (b.action === 'payout') {
    await $.decidePayout(getDb(), id, !!b.approve, b.reference?.slice(0, 80) || null);
    await audit(getDb(), a, b.approve ? 'money.payout.paid' : 'money.payout.rejected', { type: 'payout', id }, b.reference);
  } else return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  return NextResponse.json({ ok: true });
});
