import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { AppError } from '@/server/errors';
import { clientIp, currentUser, rateLimit, readFormLimited, readJson, requireUser, route } from '@/server/http';
import { emailProviderFromEnv } from '@/server/providers/email';
import * as M from '@/server/services/marketplace';
import * as $ from '@/server/services/money';

type P = { params: Promise<{ id: string }> };
export const GET = route(async (_r: Request, { params }: P) => { const u = await requireUser(); return NextResponse.json(await M.organiserView(getDb(), u.id, (await params).id)); });
/** Close the pot to new contributions. */
export const POST = route(async (_r: Request, { params }: P) => { const u = await requireUser(); await M.closeCollection(getDb(), u.id, (await params).id); return NextResponse.json({ ok: true }); });
