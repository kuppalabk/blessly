'use client';
import { useState } from 'react';
import { useT } from '@/components/I18n';

/** A designed card on the wish page: the front, and a button to open it and read the inside. */
export function CardPages({ frontUrl, insideUrl, label }: { frontUrl: string; insideUrl: string | null; label: string }) {
  const { t } = useT();
  const [inside, setInside] = useState(false);
  return (
    <div className="stack" style={{ gap: 10, alignItems: 'center' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={inside && insideUrl ? insideUrl : frontUrl} alt={inside ? t("Inside of the card: {label}", { label }) : label} className="wcard" style={{ display: 'block', width: '100%' }} />
      {insideUrl && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setInside(!inside)} aria-pressed={inside}>{inside ? t("Close the card") : t("Open the card")}</button>}
    </div>
  );
}

export function MessagePlayer({ url, kind, from }: { url: string; kind: 'audio' | 'video'; from: string }) {
  const { t } = useT();
  return (
    <section className="card-box stack" style={{ gap: 8 }} aria-label={kind === 'video' ? t('Video message from {from}', { from }) : t('Voice message from {from}', { from })}>
      <strong>{kind === 'video' ? t("🎥 A video message from {from}", { from }) : t("🎙️ A voice message from {from}", { from })}</strong>
      {kind === 'video' ? <video src={url} controls playsInline preload="metadata" style={{ width: '100%', borderRadius: 12 }} /> : <audio src={url} controls preload="metadata" style={{ width: '100%' }} />}
    </section>
  );
}
