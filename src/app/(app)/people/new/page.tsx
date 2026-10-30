import Link from 'next/link';
import { PersonForm } from '@/components/PersonForm';
import { Icon } from '@/components/Icon';
import { getDb } from '@/server/db';
import { pageUser } from '@/server/http';
import { canEdit, listFamilies } from '@/server/services/family';
import { getT } from '@/server/i18n';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("Add person") };
}

export default async function NewPerson({ searchParams }: { searchParams: Promise<{ family?: string }> }) {
  const { t } = await getT();
  const user = await pageUser();
  const families = (await listFamilies(getDb(), user.id)).filter((f) => canEdit(f.role)).map((f) => ({ id: f.id, name: f.name }));
  const want = (await searchParams).family;
  return (
    <div className="stack-lg" style={{ maxWidth: 720 }}>
      <header className="row"><Link href="/people" aria-label={t("Back to people")} className="btn btn-ghost btn-sm"><Icon name="back" size={18} /></Link><h1>{t("Add someone special")}</h1></header>
      <PersonForm families={families} defaultFamily={families.some((f) => f.id === want) ? want : null} />
    </div>
  );
}
