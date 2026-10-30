'use client';
import { useRouter } from 'next/navigation';
import { api } from '@/components/api';
import { useT } from '@/components/I18n';

export function MarkRead() {
  const { t } = useT();
  const router = useRouter();
  return <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={async () => { await api('/api/notifications', { body: { all: true } }); router.refresh(); }}>{t("Mark all as read")}</button>;
}
