import { getDb } from '@/server/db';
import { cardOverridesAll, listAnnouncements, listFestivalDates, missingFestivalYears } from '@/server/services/content';
import { FESTIVALS } from '@/lib/festivals';
import { Announcements, Cards, Festivals } from './ContentTools';

export const dynamic = 'force-dynamic';

export default async function AdminContent() {
  const db = getDb();
  const y = new Date().getUTCFullYear();
  const [rows, missing, overrides, history] = await Promise.all([listFestivalDates(db), missingFestivalYears(db, [y, y + 1, y + 2]), cardOverridesAll(db), listAnnouncements(db)]);
  return (
    <div className="stack-lg">
      <div className="two-col">
        <Festivals rows={rows.map((r) => ({ ...r, updatedAt: undefined }))} missing={missing} builtins={FESTIVALS.map((f) => ({ id: f.id, name: f.name, occasion: f.occasion, regions: f.regions.join(',') }))} />
        <Announcements history={history.map((h) => ({ id: h.id, title: h.title, audience: h.audience, recipients: h.recipients, createdAt: h.createdAt.toISOString() }))} />
      </div>
      <Cards overrides={overrides} />
    </div>
  );
}
