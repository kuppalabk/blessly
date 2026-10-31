import Link from 'next/link';
import { getDb } from '@/server/db';
import { pageUser } from '@/server/http';
import { enabledProviders } from '@/server/oidc';
import { phoneSignInAvailable, signInOptions } from '@/server/services/signin';
import { adminNeeds2fa } from '@/server/services/admin';
import { Icon } from '@/components/Icon';
import { SecuritySettings } from './SecuritySettings';
import { getT } from '@/server/i18n';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("Sign-in and security") };
}

export default async function Security({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { t } = await getT();
  const user = await pageUser();
  const sp = await searchParams;
  const options = await signInOptions(getDb(), user.id);
  return (
    <div className="stack-lg" style={{ maxWidth: 600 }}>
      <header className="row"><Link href="/settings" className="btn btn-ghost btn-sm" aria-label={t("Back to settings")}><Icon name="back" size={18} /></Link><h1>{t("Sign-in and security")}</h1></header>
      {sp.linked && <p className="notice" role="status">{t("{provider} is now connected.", { provider: sp.linked === 'google' ? 'Google' : 'Apple' })}</p>}
      <SecuritySettings options={options} providers={enabledProviders()} phoneAvailable={phoneSignInAvailable()} adminRequired={user.role === 'admin' && adminNeeds2fa()} isAdmin={user.role === 'admin'} />
    </div>
  );
}
