import { redirect } from 'next/navigation';
import { getDb } from '@/server/db';
import { pageUser } from '@/server/http';
import { getMyBusiness } from '@/server/services/business';
import { CustomerForm } from '../CustomerForm';
import { getT } from '@/server/i18n';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("Add customer") };
}

export default async function NewCustomer() {
  const { t } = await getT();
  const user = await pageUser();
  if (!(await getMyBusiness(getDb(), user.id))) redirect('/business');
  return <section className="stack" style={{ maxWidth: 720 }}><h2>{t("Add customer")}</h2><CustomerForm /></section>;
}
