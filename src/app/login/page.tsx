import { Suspense } from 'react';
import { AuthForm } from '@/components/AuthForm';
import { enabledProviders } from '@/server/oidc';
import { phoneSignInAvailable } from '@/server/services/signin';
import { getT } from '@/server/i18n';
export const dynamic = 'force-dynamic';
export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("Log in") };
}
export default function Page() {
  return <Suspense><AuthForm mode="login" providers={enabledProviders()} phone={phoneSignInAvailable()} /></Suspense>;
}
