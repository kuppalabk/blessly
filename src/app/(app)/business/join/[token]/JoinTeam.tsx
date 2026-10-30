'use client';
import { useState } from 'react';
import { api } from '@/components/api';
import { ErrorMessage } from '@/components/ErrorMessage';
import { useT } from '@/components/I18n';

export function JoinTeam({ token }: { token: string }) {
  const { t } = useT();
  const [error, setError] = useState<unknown>(null);
  return (
    <>
      <button className="btn" onClick={async () => { try { await api(`/api/business/join/${token}`, { method: 'POST' }); window.location.assign('/business'); } catch (e) { setError(e); } }}>{t("Join the team")}</button>
      <ErrorMessage error={error} />
    </>
  );
}
