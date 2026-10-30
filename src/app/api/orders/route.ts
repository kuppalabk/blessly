import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { AppError } from '@/server/errors';
import { requireUser, route } from '@/server/http';
import { moneyEnabled } from '@/server/services/money';
import { myOrders } from '@/server/services/marketplace';

export const GET = route(async () => {
  const u = await requireUser();
  if (!moneyEnabled()) throw new AppError(404, 'not_found', 'Not found');
  return NextResponse.json({ orders: await myOrders(getDb(), u.id) });
});
