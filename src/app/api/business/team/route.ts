import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { readJson, requireUser, route } from '@/server/http';
import { inviteStaff, listTeam, requireBusiness } from '@/server/services/business';
import { emailProviderFromEnv } from '@/server/providers/email';

export const GET = route(async () => {
  const u = await requireUser();
  return NextResponse.json(await listTeam(getDb(), await requireBusiness(getDb(), u.id)));
});
export const POST = route(async (req: Request) => {
  const u = await requireUser();
  const inv = await inviteStaff(getDb(), u.id, await readJson(req), emailProviderFromEnv(), process.env.APP_URL ?? new URL(req.url).origin);
  return NextResponse.json({ invite: { id: inv.id, email: inv.email, token: inv.token, expiresAt: inv.expiresAt } }, { status: 201 });
});
