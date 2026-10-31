import Link from 'next/link';
import { getT } from '@/server/i18n';
export default async function NotFound() {
  const { t } = await getT();
  return (
    <main style={{ maxWidth: 420, margin: '0 auto', padding: '64px 16px', textAlign: 'center' }} className="stack">
      <h1>{t("Page not found")}</h1>
      <p className="muted">{t("This link may have expired or been removed.")}</p>
      <Link href="/" className="btn">{t("Go to Blessly")}</Link>
    </main>
  );
}
