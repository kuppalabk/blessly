import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { AppError } from '@/server/errors';
import { clientIp, currentUser, rateLimit, readFormLimited, readJson, requireUser, route } from '@/server/http';
import { emailProviderFromEnv } from '@/server/providers/email';
import * as M from '@/server/services/marketplace';
import * as $ from '@/server/services/money';

export const PUT = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => { const u = await requireUser(); await M.updateSellerOrder(getDb(), u.id, (await params).id, await readJson(req)); return NextResponse.json({ ok: true }); });
