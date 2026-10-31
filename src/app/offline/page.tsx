import { getT } from '@/server/i18n';
export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("Offline") };
}
export default async function Offline() {
  const { t } = await getT();
  return (
    <main style={{ maxWidth: 420, margin: '0 auto', padding: '64px 16px', textAlign: 'center' }} className="stack">
      <h1>{t("You’re offline")}</h1>
      <p className="muted">{t("Reconnect to see your people and reminders. Anything you saved is safe.")}</p>
    </main>
  );
}
