import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { AppError } from '@/server/errors';
import { requireUser, route } from '@/server/http';
import { moneyEnabled } from '@/server/services/money';
import { shopProducts } from '@/server/services/marketplace';

export const GET = route(async (req: Request) => {
  await requireUser();
  if (!moneyEnabled()) throw new AppError(404, 'not_found', 'Not found');
  const country = new URL(req.url).searchParams.get('country') ?? undefined;
  return NextResponse.json({ products: await shopProducts(getDb(), country) });
});
