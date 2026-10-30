import Link from 'next/link';
import { ResetForm } from './ResetForm';
import { getT } from '@/server/i18n';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("Choose a new password"), robots: { index: false } };
}

export default async function Reset({ params }: { params: Promise<{ token: string }> }) {
  const { t } = await getT();
  const { token } = await params;
  return (
    <div style={{ maxWidth: 420, margin: '0 auto', padding: '40px 16px' }} className="stack-lg">
      <Link href="/" className="brand">{t("Blessly")}</Link>
      <h1>{t("Choose a new password")}</h1>
      <ResetForm token={token} />
    </div>
  );
}
