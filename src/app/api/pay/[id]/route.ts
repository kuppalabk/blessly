import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { AppError } from '@/server/errors';
import { clientIp, currentUser, rateLimit, readFormLimited, readJson, requireUser, route } from '@/server/http';
import { emailProviderFromEnv } from '@/server/providers/email';
import * as M from '@/server/services/marketplace';
import * as $ from '@/server/services/money';
const app = (req: Request) => process.env.APP_URL ?? new URL(req.url).origin;

/** TEST MODE checkout result. A real provider would confirm payments by webhook instead. */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  $.assertMoney();
  await rateLimit(`pay:${clientIp(req)}`, 60, 60 * 60000);
  const { result } = (await readJson(req)) as { result?: string };
  const id = (await params).id;
  const r = await $.completePayment(getDb(), id, result === 'success', { email: emailProviderFromEnv(), appUrl: app(req) });
  const p = await $.getPayment(getDb(), id);
  return NextResponse.json({ ...r, returnUrl: p.returnUrl });
});
