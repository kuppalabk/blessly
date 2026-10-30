import { Suspense } from 'react';
import { TwoFactorForm } from '@/components/CodeSignIn';
import { getT } from '@/server/i18n';
export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("Two-step verification") };
}
export default function Page() { return <Suspense><TwoFactorForm /></Suspense>; }
