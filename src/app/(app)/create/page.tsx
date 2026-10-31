import { cfg } from '@/server/settings';
import { getDb } from '@/server/db';
import { pageUser } from '@/server/http';
import { listPeople } from '@/server/services/people';
import { isOccasion } from '@/lib/cards';
import { Studio } from './Studio';
import { cardOverridesAll } from '@/server/services/content';
import { getDesign } from '@/server/services/designs';
import { getT } from '@/server/i18n';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("Create a wish") };
}

export default async function CreatePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await pageUser();
  const sp = await searchParams;
  const people = (await listPeople(getDb(), user.id, user.timezone)).map((p) => ({ id: p.id, name: p.name, relationship: p.relationship, language: p.language, notes: p.notes }));
  const occasion = sp.occasion && isOccasion(sp.occasion) ? sp.occasion : 'birthday';
  const person = people.find((p) => p.id === sp.person) ?? null;
  const d = sp.card ? await getDesign(getDb(), user.id, sp.card).catch(() => null) : null;
  const card = d ? { id: d.id, title: d.title, page: d.doc.pages[0], urls: d.urls, language: d.doc.language } : null;
  return <Studio card={card} people={people} initialOccasion={occasion} initialPersonId={person?.id ?? null} senderName={user.name} defaultLanguage={person?.language ?? user.language} aiEnabled={!!cfg('ANTHROPIC_API_KEY')} cardOverrides={await cardOverridesAll(getDb())} />;
}
