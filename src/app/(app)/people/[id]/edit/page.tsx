import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/server/db';
import { pageUser } from '@/server/http';
import { getPerson } from '@/server/services/people';
import { AppError } from '@/server/errors';
import { PersonForm } from '@/components/PersonForm';
import { canEdit, listFamilies } from '@/server/services/family';
import { Icon } from '@/components/Icon';
import { getT } from '@/server/i18n';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("Edit person") };
}

export default async function EditPerson({ params }: { params: Promise<{ id: string }> }) {
  const { t } = await getT();
  const user = await pageUser();
  const { id } = await params;
  const p = await getPerson(getDb(), user.id, id, user.timezone).catch((e) => { if (e instanceof AppError && e.status === 404) notFound(); throw e; });
  const families = (await listFamilies(getDb(), user.id)).filter((f) => canEdit(f.role) || f.id === p.familyId).map((f) => ({ id: f.id, name: f.name }));
  return (
    <div className="stack-lg" style={{ maxWidth: 720 }}>
      <header className="row"><Link href={`/people/${p.id}`} aria-label={t("Back")} className="btn btn-ghost btn-sm"><Icon name="back" size={18} /></Link><h1>{t("Edit {name}", { name: p.name })}</h1></header>
      <PersonForm initial={{ id: p.id, name: p.name, relationship: p.relationship, phone: p.phone, email: p.email, language: p.language, notes: p.notes, occasions: p.occasions.map((o) => ({ kind: o.kind, label: o.label, month: o.month, day: o.day, remindGift: o.remindGift, remindIdeas: o.remindIdeas, remindDraft: o.remindDraft, remindDay: o.remindDay })), familyId: p.familyId }} families={families} />
    </div>
  );
}
