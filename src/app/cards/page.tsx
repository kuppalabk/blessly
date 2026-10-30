import Link from 'next/link';
import { CardLibrary } from './CardLibrary';
import { Icon } from '@/components/Icon';
import { getDb } from '@/server/db';
import { cardOverridesAll } from '@/server/services/content';
import { getT } from '@/server/i18n';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t('Card library'), description: t('250 card designs for each of 40 occasions, in 32 languages.') };
}

export default async function Cards() {
  const { t } = await getT();
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '16px 16px 48px' }} className="stack-lg">
      <header className="row between">
        <Link href="/" className="brand"><span className="brand-mark"><Icon name="sparkle" size={18} strokeWidth={2} /></span>{t("Blessly")}</Link>
        <Link href="/create" className="btn btn-sm">{t("Create a wish")}</Link>
      </header>
      <div className="stack">
        <h1 style={{ fontSize: 'clamp(28px, 5vw, 40px)' }}>{t("250 designs for every occasion")}</h1>
        <p className="muted">{t("40 occasions × 250 designs (10,000 cards), in 32 languages. All artwork is original and free to use.")}</p>
      </div>
      <CardLibrary overrides={await cardOverridesAll(getDb())} />
    </div>
  );
}
