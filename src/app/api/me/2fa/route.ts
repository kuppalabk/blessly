import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { rateLimit, readJson, requireUser, route } from '@/server/http';
import * as S from '@/server/services/signin';

/** action: setup | confirm | disable | recovery */
export const POST = route(async (req: Request) => {
  const u = await requireUser();
  await rateLimit(`mfa-manage:${u.id}`, 20, 15 * 60000);
  const body = (await readJson(req)) as { action?: string; code?: string };
  const code = String(body.code ?? '');
  if (body.action === 'setup') return NextResponse.json(await S.startMfaSetup(getDb(), u));
  if (body.action === 'confirm') return NextResponse.json(await S.confirmMfaSetup(getDb(), u, code));
  if (body.action === 'disable') { await S.disableMfa(getDb(), u, code); return NextResponse.json({ ok: true }); }
  if (body.action === 'recovery') return NextResponse.json(await S.regenerateRecoveryCodes(getDb(), u, code));
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
});
