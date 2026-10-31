'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/components/api';
import { useT } from '@/components/I18n';

export function JoinAffiliate() {
  const { t } = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="stack">
      <button type="button" className="btn" disabled={busy} onClick={async () => {
        setBusy(true); setError(null);
        try { await api('/api/affiliate', { body: {} }); router.refresh(); }
        catch (e) { setError(e instanceof Error ? e.message : t("Could not apply")); setBusy(false); }
      }}>{busy ? t("Applying…") : t("Apply to join")}</button>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

export function CopyLink({ value }: { value: string }) {
  const { t } = useT();
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={async () => {
      try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 2000); } catch { setDone(false); }
    }}>{done ? t("Copied") : t("Copy")}</button>
  );
}
