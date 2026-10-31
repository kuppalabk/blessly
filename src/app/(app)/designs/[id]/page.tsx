import { notFound } from 'next/navigation';
import { getDb } from '@/server/db';
import { AppError } from '@/server/errors';
import { pageUser } from '@/server/http';
import { getDesign } from '@/server/services/designs';
import { CardEditor } from '@/components/editor/CardEditor';
import { moneyEnabled } from '@/server/services/money';
import { getT } from '@/server/i18n';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("Card editor") };
}

export default async function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await pageUser();
  const d = await getDesign(getDb(), user.id, (await params).id).catch((e) => { if (e instanceof AppError && e.status === 404) notFound(); throw e; });
  return <CardEditor design={{ id: d.id, title: d.title, occasion: d.occasion, favourite: d.favourite, doc: d.doc, urls: d.urls }} language={user.language} money={moneyEnabled()} />;
}
