import { redirect } from 'next/navigation';
import { getDb } from '@/server/db';
import { pageUser } from '@/server/http';
import { getMyBusiness } from '@/server/services/business';
import { ImportForm } from './ImportForm';
import { getT } from '@/server/i18n';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("Import customers") };
}

export default async function ImportPage() {
  const { t } = await getT();
  const user = await pageUser();
  if (!(await getMyBusiness(getDb(), user.id))) redirect('/business');
  return <section className="stack" style={{ maxWidth: 760 }}><h2>{t("Import customers")}</h2><ImportForm /></section>;
}
