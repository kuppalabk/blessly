'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/components/api';
import { useT } from '@/components/I18n';

export function JoinButton({ token }: { token: string }) {
  const { t } = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="stack" style={{ width: '100%' }}>
      <button className="btn btn-block" disabled={busy} onClick={async () => {
        setBusy(true); setError(null);
        try {
          const r = await api<{ familyId: string }>(`/api/invites/${token}`, { method: 'POST' });
          router.push(`/family/${r.familyId}`);
          router.refresh();
        } catch (e) { setError(e instanceof Error ? e.message : t("Could not join")); setBusy(false); }
      }}>{busy ? t("Joining…") : t("Join the family circle")}</button>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
