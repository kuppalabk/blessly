import { getDb } from '@/server/db';
import { AppError } from '@/server/errors';
import { currentUser } from '@/server/http';
import { calendarFile } from '@/server/services/celebrations';

/** Add to calendar (Apple, Google, Outlook all accept .ics). */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const url = new URL(req.url);
  try {
    const viewer = await currentUser();
    const f = await calendarFile(getDb(), (await params).slug, url.searchParams.get('g'), viewer?.id ?? null, process.env.APP_URL ?? url.origin);
    return new Response(f.body, { headers: { 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.filename)}`, 'cache-control': 'no-store' } });
  } catch (e) {
    return new Response('Not found', { status: e instanceof AppError ? e.status : 500 });
  }
}
