'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/components/api';
import { useT } from '@/components/I18n';

export function DeleteCustomer({ id, name }: { id: string; name: string }) {
  const { t } = useT();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  if (!confirming) return <button className="btn btn-danger" onClick={() => setConfirming(true)}>{t("Delete customer")}</button>;
  return (
    <div className="card-box stack" role="alertdialog" aria-label={t("Confirm delete")}>
      <p>{t("Delete {name}? Their message history stays in your log without their name.", { name })}</p>
      <div className="row">
        <button className="btn btn-danger grow" onClick={async () => { await api(`/api/business/customers/${id}`, { method: 'DELETE' }); router.push('/business/customers'); router.refresh(); }}>{t("Yes, delete")}</button>
        <button className="btn btn-ghost grow" onClick={() => setConfirming(false)}>{t("Cancel")}</button>
      </div>
    </div>
  );
}
