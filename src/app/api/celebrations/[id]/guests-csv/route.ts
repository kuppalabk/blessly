import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { currentUser, rateLimit, readJson, requireUser, route, clientIp, readFormLimited } from '@/server/http';
import { emailProviderFromEnv } from '@/server/providers/email';
import * as S from '@/server/services/celebrations';
type P = { params: Promise<{ id: string }> };
const cell = (v: unknown) => { const s = v == null ? '' : String(v); const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe; };
/** Guest list as a spreadsheet (formula-looking cells are escaped). */
export const GET = route(async (_r: Request, { params }: P) => {
  const u = await requireUser();
  const v = await S.hostView(getDb(), u.id, (await params).id);
  const rows = [['Name', 'Email', 'Phone', 'Answer', 'People', 'Dietary needs', 'Accessibility', 'Note', 'Answered']].concat(
    v.guests.map((g) => [g.name, g.email ?? '', g.phone ?? '', g.status === 'invited' ? 'No answer yet' : g.status, String(g.partySize), g.diet ?? '', g.access ?? '', g.note ?? '', g.respondedAt?.toISOString().slice(0, 10) ?? '']));
  return new Response('\ufeff' + rows.map((r) => r.map(cell).join(',')).join('\r\n'), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="guests.csv"' } });
});
