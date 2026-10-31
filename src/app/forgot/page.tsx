import Link from 'next/link';
import { ForgotForm } from './ForgotForm';
import { getT } from '@/server/i18n';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("Forgot password") };
}

export default async function Forgot() {
  const { t } = await getT();
  return (
    <div style={{ maxWidth: 420, margin: '0 auto', padding: '40px 16px' }} className="stack-lg">
      <Link href="/" className="brand">{t("Blessly")}</Link>
      <h1>{t("Reset your password")}</h1>
      <p className="muted">{t("Enter your account email and we’ll send you a link to choose a new password.")}</p>
      <ForgotForm />
      <p className="muted"><Link href="/login">{t("Back to log in")}</Link></p>
    </div>
  );
}
