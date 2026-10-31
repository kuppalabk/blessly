'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/components/api';
import { useT } from '@/components/I18n';

export function DeletePerson({ id, name }: { id: string; name: string }) {
  const { t } = useT();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!confirming) return <button className="btn btn-danger" onClick={() => setConfirming(true)}>{t("Delete {name}", { name })}</button>;
  return (
    <div className="card-box stack" role="alertdialog" aria-label={t("Confirm delete")}>
      <p>{t("Delete {name} and all their reminders? This can’t be undone.", { name })}</p>
      <div className="row">
        <button className="btn btn-danger grow" disabled={busy} onClick={async () => { setBusy(true); await api(`/api/people/${id}`, { method: 'DELETE' }); router.push('/people'); router.refresh(); }}>{t("Yes, delete")}</button>
        <button className="btn btn-ghost grow" onClick={() => setConfirming(false)}>{t("Cancel")}</button>
      </div>
    </div>
  );
}
