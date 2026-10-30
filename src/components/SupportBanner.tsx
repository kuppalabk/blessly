'use client';
import { api } from './api';
import { useT } from '@/components/I18n';

/** Shown on every page during an admin's read-only support view. */
export function SupportBanner({ name, admin }: { name: string; admin: string }) {
  const { t } = useT();
  return (
    <div role="status" className="support-banner">
      <span><b>{t("Support view of {name}", { name })}</b> {' '}{t("— read-only, as {admin}. Nothing can be changed.", { admin })}</span>
      <button className="btn btn-sm" style={{ background: '#fff', color: 'var(--ink)' }} onClick={async () => { await api('/api/admin/view-as', { method: 'DELETE' }).catch(() => undefined); window.location.assign('/admin/users'); }}>{t("Exit")}</button>
    </div>
  );
}
