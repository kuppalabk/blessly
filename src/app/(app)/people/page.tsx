import Link from 'next/link';
import { getDb } from '@/server/db';
import { pageUser } from '@/server/http';
import { listPeople } from '@/server/services/people';
import { formatDate } from '@/lib/dates';
import { PeopleSearch } from './PeopleSearch';
import { getT } from '@/server/i18n';

export async function generateMetadata() {
  const { t, intl } = await getT();
  return { title: t("People") };
}

export default async function PeoplePage() {
  const { t, intl: locale } = await getT();
  const user = await pageUser();
  const people = await listPeople(getDb(), user.id, user.timezone);
  const rows = people.map((p) => ({
    id: p.id, name: p.name, relationship: p.relationship,
    next: p.nextOccasion ? `${t(p.nextOccasion.label)} · ${formatDate(p.nextOccasion.next, undefined, locale)}` : t('No dates yet'),
    days: p.nextOccasion?.daysAway ?? null,
    sharedBy: p.isMine ? null : p.ownerName ?? 'family', shared: !!p.familyId
  }));
  return (
    <div className="stack-lg">
      <header className="row between">
        <h1>{t("People")}</h1>
        <Link href="/people/new" className="btn btn-sm">{t("Add person")}</Link>
      </header>
      {rows.length ? <PeopleSearch rows={rows} /> : (
        <div className="card-box stack">
          <p>{t("No one here yet. Add family, friends and colleagues with their birthdays and anniversaries.")}</p>
          <Link href="/people/new" className="btn">{t("Add your first person")}</Link>
        </div>
      )}
    </div>
  );
}
