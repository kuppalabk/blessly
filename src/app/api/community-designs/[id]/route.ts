import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { AppError } from '@/server/errors';
import { clientIp, currentUser, rateLimit, readFormLimited, readJson, requireUser, route } from '@/server/http';
import { emailProviderFromEnv } from '@/server/providers/email';
import * as M from '@/server/services/marketplace';
import * as $ from '@/server/services/money';

/** Copies a community design into your card photos so you can use it as a card background. */
export const POST = route(async (_r: Request, { params }: { params: Promise<{ id: string }> }) => {
  const u = await requireUser();
  $.assertMoney();
  return NextResponse.json({ file: await M.useCommunityDesign(getDb(), u.id, (await params).id) }, { status: 201 });
});
