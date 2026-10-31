import Link from 'next/link';
import { pageUser } from '@/server/http';
import { SettingsForm } from './SettingsForm';
import { PushSettings } from './PushSettings';
import { YourData } from './YourData';
import { getDb } from '@/server/db';
import { entitlements } from '@/server/services/billing';
import { getT } from '@/server/i18n';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("Settings") };
}

export default async function Settings() {
  const { t } = await getT();
  const user = await pageUser();
  return (
    <div className="stack-lg" style={{ maxWidth: 560 }}>
      <h1>{t("Settings")}</h1>
      <p className="muted">{user.email}</p>
      <Link href="/plans" className="item"><span className="grow"><b>{t("Plan: {name}", { name: (await entitlements(getDb(), user.id)).plan.name })}</b><br /><span className="muted small">{t("Family circles, albums and business messages")}</span></span><span aria-hidden="true">›</span></Link>
      <Link href="/affiliate" className="item"><span className="grow"><b>{t("Partner programme")}</b><br /><span className="muted small">{t("Share Blessly and earn a share of every purchase")}</span></span><span aria-hidden="true">›</span></Link>
      <Link href="/settings/security" className="item"><span className="grow"><b>{t("Sign-in and security")}</b><br /><span className="muted small">{t("Two-step verification, Google and Apple, phone sign-in, password")}</span></span><span aria-hidden="true">›</span></Link>
      <PushSettings />
      {user.role === 'admin' && <Link href="/admin" className="item"><span className="grow"><b>{t("Platform admin")}</b><br /><span className="muted small">{t("Users, businesses, system health and audit log")}</span></span><span aria-hidden="true">›</span></Link>}
      <Link href="/business" className="item"><span className="grow"><b>{t("Blessly for business")}</b><br /><span className="muted small">{t("Automatic birthday wishes to your customers on WhatsApp and email")}</span></span><span aria-hidden="true">›</span></Link>
      <SettingsForm user={user} />
      <YourData />
    </div>
  );
}
