import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/server/db';
import { pageUser } from '@/server/http';
import { getWish } from '@/server/services/wishes';
import { AppError } from '@/server/errors';
import { GREETINGS, LANGUAGES, type LanguageCode, type OccasionId } from '@/lib/i18n-data';
import { normalizePhone } from '@/lib/send-links';
import { GreetingCard, ScriptFont } from '@/components/GreetingCard';
import { Icon } from '@/components/Icon';
import { SendPanel } from './SendPanel';
import { wishMedia } from '@/server/services/designs';
import { CardPages, MessagePlayer } from '@/components/editor/CardPages';
import { getT } from '@/server/i18n';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("Send your wish") };
}

export default async function WishPage({ params }: { params: Promise<{ id: string }> }) {
  const { t } = await getT();
  const user = await pageUser();
  const { id } = await params;
  const data = await getWish(getDb(), user.id, id).catch((e) => { if (e instanceof AppError && e.status === 404) notFound(); throw e; });
  const { wish, page, person, sends } = data;
  const lang = wish.language as LanguageCode;
  const rtl = LANGUAGES.find((l) => l.code === lang)?.rtl ?? false;
  const appUrl = process.env.APP_URL ?? '';
  const media = await wishMedia(getDb(), wish);
  const greeting = GREETINGS[wish.occasion as OccasionId][lang];
  return (
    <div className="stack-lg">
      <ScriptFont language={lang} />
      <header className="row">
        <Link href="/home" aria-label={t("Back to home")} className="btn btn-ghost btn-sm"><Icon name="back" size={18} /></Link>
        <h1>{t("Send to {recipientName}", { recipientName: wish.recipientName })}</h1>
      </header>
      <div className="two-col">
        <div className="stack" style={{ maxWidth: 360, width: '100%', justifySelf: 'center' }}>
          {media.card
            ? <CardPages frontUrl={media.card.frontUrl} insideUrl={media.card.insideUrl} label={`${greeting}, ${wish.recipientName}`} />
            : <GreetingCard occasion={wish.occasion as OccasionId} designIndex={wish.designIndex} greeting={greeting} to={wish.recipientName} language={lang} rtl={rtl} />}
          {media.message && <MessagePlayer url={media.message.url} kind={media.message.kind} from="you" />}
          <p dir={rtl ? 'rtl' : 'ltr'} className="card-box" style={{ whiteSpace: 'pre-line' }}>{wish.text}</p>
        </div>
        <SendPanel
          wishId={wish.id}
          text={wish.text}
          recipientName={wish.recipientName}
          pageUrl={page ? `${appUrl}/w/${page.slug}` : null}
          phone={normalizePhone(person?.phone, user.country)}
          email={person?.email ?? null}
          sends={sends.map((s) => ({ id: s.id, channel: s.channel, recipient: s.recipient, sendAt: s.sendAt.toISOString(), status: s.status }))}
          timezone={user.timezone}
        />
      </div>
    </div>
  );
}
