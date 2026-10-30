import { Suspense } from 'react';
import { PhoneSignIn } from '@/components/CodeSignIn';
import { getT } from '@/server/i18n';
export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("Sign in with a code") };
}
export default function Page() { return <Suspense><PhoneSignIn /></Suspense>; }
