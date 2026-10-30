'use client';
import Link from 'next/link';
import { ApiError } from './api';
import { useT } from '@/components/I18n';

/** Shows an API error; plan-limit errors get an "See plans" link. */
export function ErrorMessage({ error }: { error: unknown }) {
  const { t } = useT();
  if (!error) return null;
  const msg = error instanceof Error ? error.message : String(error);
  const upgrade = error instanceof ApiError && error.code === 'plan_limit';
  return <p className="error" role="alert">{msg}{upgrade && <> <Link href="/plans">{t("See plans")}</Link></>}</p>;
}
