import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getDb } from '@/server/db';

/** For load balancers and uptime monitors: 200 when the app can reach its database. */
export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
}
export const dynamic = 'force-dynamic';
