import { notFound } from 'next/navigation';
import { getDb } from '@/server/db';
import { AppError } from '@/server/errors';
import { moneyEnabled } from '@/server/services/money';
import { openGiftCard } from '@/server/services/marketplace';
import { getT } from '@/server/i18n';

export async function generateMetadata() {
  const { t, intl } = await getT();
  return { title: t("Your gift card"), robots: { index: false } };
}
export const dynamic = 'force-dynamic';

export default async function GiftCard({ params }: { params: Promise<{ token: string }> }) {
  const { t, intl } = await getT();
  if (!moneyEnabled()) notFound();
  const g = await openGiftCard(getDb(), (await params).token).catch((e) => { if (e instanceof AppError && (e.status === 404 || e.status === 410)) notFound(); throw e; });
  return (
    <main className="stack-lg" style={{ maxWidth: 520, margin: '0 auto', padding: '32px 16px' }}>
      <p className="notice" style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)' }}><b>{t("Test mode.")}</b> {' '}{t("This is a sandbox card and can’t be spent.")}</p>
      <section className="card-box stack" style={{ background: `linear-gradient(150deg, ${g.brand.color}, ${g.brand.color}cc)`, color: '#fff', border: 0, minHeight: 200 }}>
        <span style={{ fontSize: 40 }} aria-hidden>{g.brand.emoji}</span>
        <h1 style={{ margin: 0, color: '#fff' }}>{g.value}</h1>
        <p style={{ margin: 0 }}>{t("{name} gift card for {recipientName}", { name: g.brand.name, recipientName: g.recipientName })}</p>
      </section>
      <p style={{ margin: 0 }}>{t("From")}{' '}<b>{g.from}</b>{g.message ? <>: “{g.message}”</> : null}</p>
      <section className="card-box stack" aria-label={t("How to use it")}>
        <p className="muted small" style={{ margin: 0 }}>{t("Card code")}</p>
        <p className="code" data-testid="gift-code" style={{ fontSize: 20, margin: 0, wordBreak: 'break-all' }}>{g.code}</p>
        {g.pin && <><p className="muted small" style={{ margin: 0 }}>{t("PIN")}</p><p className="code" style={{ fontSize: 20, margin: 0 }}>{g.pin}</p></>}
        {g.expiresOn && <p className="small" style={{ margin: 0 }}>{t("Use by")}{' '}{new Date(g.expiresOn).toLocaleDateString(intl, { day: 'numeric', month: 'long', year: 'numeric' })}</p>}
        <p className="muted small" style={{ margin: 0 }}>{g.brand.terms}</p>
      </section>
    </main>
  );
}
