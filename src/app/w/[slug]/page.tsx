import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/server/db';
import { getPublicWishPage } from '@/server/services/wishes';
import { AppError } from '@/server/errors';
import { GREETINGS, LANGUAGES, type LanguageCode, type OccasionId } from '@/lib/i18n-data';
import { cardDesign } from '@/lib/cards';
import { GreetingCard, ScriptFont } from '@/components/GreetingCard';
import { SignForm } from './SignForm';
import { currentUser } from '@/server/http';
import { wishMedia } from '@/server/services/designs';
import { CardPages, MessagePlayer } from '@/components/editor/CardPages';
import { getT } from '@/server/i18n';
import { LanguagePicker } from '@/components/LanguagePicker';

export const dynamic = 'force-dynamic';

async function load(slug: string, countView: boolean) {
  return getPublicWishPage(getDb(), slug, countView).catch((e) => { if (e instanceof AppError && e.status === 404) notFound(); throw e; });
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { wish } = await load((await params).slug, false);
  const g = GREETINGS[wish.occasion as OccasionId][wish.language as LanguageCode];
  const media = await wishMedia(getDb(), wish);
  const img = `${process.env.APP_URL ?? ''}${media.card?.frontUrl ?? cardDesign(wish.occasion as OccasionId, wish.designIndex).art.src}`;
  const { t } = await getT();
  return { title: `${g}, ${wish.recipientName}`, description: t('A wish from {name}', { name: wish.senderName }), robots: { index: false, follow: false }, openGraph: { title: `${g}, ${wish.recipientName}!`, description: t('A wish from {name}', { name: wish.senderName }), images: [img] } };
}

export default async function PublicWish({ params }: { params: Promise<{ slug: string }> }) {
  const { t } = await getT();
  const { slug } = await params;
  const { wish, signatures, page } = await load(slug, true);
  const lang = wish.language as LanguageCode;
  const rtl = LANGUAGES.find((l) => l.code === lang)?.rtl ?? false;
  const occasion = wish.occasion as OccasionId;
  const art = cardDesign(occasion, wish.designIndex).art;
  const media = await wishMedia(getDb(), wish);
  const greeting = GREETINGS[occasion][lang];
  return (
    <div style={{ minHeight: '100vh', backgroundImage: `linear-gradient(rgba(251,248,245,.86), rgba(251,248,245,.94)), url(${art.src})`, backgroundSize: 'cover', backgroundAttachment: 'fixed' }}>
      <ScriptFont language={lang} />
      <main className="stack-lg" style={{ maxWidth: 560, margin: '0 auto', padding: '28px 16px 48px' }}>
        <div style={{ maxWidth: 380, width: '100%', margin: '0 auto' }}>
          {media.card
            ? <CardPages frontUrl={media.card.frontUrl} insideUrl={media.card.insideUrl} label={t("{greeting}, {recipientName} — a card from {senderName}", { greeting, recipientName: wish.recipientName, senderName: wish.senderName })} />
            : <GreetingCard occasion={occasion} designIndex={wish.designIndex} greeting={greeting} to={wish.recipientName} language={lang} rtl={rtl} />}
        </div>
        {media.message && <MessagePlayer url={media.message.url} kind={media.message.kind} from={wish.senderName} />}
        <p dir={rtl ? 'rtl' : 'ltr'} className="card-box" style={{ whiteSpace: 'pre-line', fontSize: 18, lineHeight: 1.6 }}>{wish.text}</p>
        <section className="card-box stack" aria-labelledby="wall">
          <h2 id="wall">{t("Wishes from friends")}{signatures.length ? ` · ${signatures.length}` : ''}</h2>
          {signatures.length === 0 && <p className="muted">{t("Be the first to add a message for {recipientName}.", { recipientName: wish.recipientName })}</p>}
          <ul className="list" style={{ gap: 10 }}>
            {signatures.map((s) => (
              <li key={s.id} className="row" style={{ alignItems: 'flex-start' }}>
                <span className="avatar" style={{ width: 34, height: 34, fontSize: 12, background: 'var(--primary-soft)', color: 'var(--primary-ink)' }}>{s.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()}</span>
                <p style={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}><b>{s.name}</b> {s.message}</p>
              </li>
            ))}
          </ul>
          {page.allowSignatures && <SignForm slug={slug} recipientName={wish.recipientName} defaultName={(await currentUser())?.name ?? ''} />}
        </section>
        <p className="small" style={{ textAlign: 'center' }}><Link href="/">{t("Made with Blessly · create your own free")}</Link></p>
        <div className="row" style={{ justifyContent: 'center' }}><LanguagePicker /></div>
      </main>
    </div>
  );
}
