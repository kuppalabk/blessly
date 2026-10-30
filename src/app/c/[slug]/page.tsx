import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/server/db';
import { AppError } from '@/server/errors';
import { currentUser } from '@/server/http';
import { publicView } from '@/server/services/celebrations';
import { potsFor } from '@/server/services/marketplace';
import { celebrations as celTable } from '@/server/schema';
import { eq } from 'drizzle-orm';
import { formatMoney } from '@/lib/money';
import { GreetingCard } from '@/components/GreetingCard';
import { Countdown, GuestToken, PostForm, RsvpBox } from '@/components/celebrations/GuestParts';
import { cardDesign } from '@/lib/cards';
import { GREETINGS } from '@/lib/i18n-data';
import { getT } from '@/server/i18n';
import { LanguagePicker } from '@/components/LanguagePicker';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> };

async function load(slug: string, g: string | undefined) {
  const viewer = await currentUser();
  try {
    return { view: await publicView(getDb(), slug, g ?? null, viewer?.id ?? null), viewer, blocked: false as const };
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    if (e instanceof AppError && e.status === 403) return { view: null, viewer, blocked: true as const };
    throw e;
  }
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { view } = await load((await params).slug, (await searchParams).g);
  const { t, intl, tp } = await getT();
  if (!view) return { title: t('Invitation'), robots: { index: false } };
  const c = view.celebration;
  return {
    title: c.title,
    description: t('{name} invites you', { name: c.hostName }),
    robots: { index: c.visibility === 'public', follow: false },
    openGraph: { title: c.title, description: t('{name} invites you', { name: c.hostName }), images: [`${process.env.APP_URL ?? ''}${cardDesign(c.occasion, c.designIndex).art.src}`] }
  };
}

export default async function CelebrationPage({ params, searchParams }: Props) {
  const { t, intl, tp } = await getT();
  const { slug } = await params;
  const g = (await searchParams).g;
  const { view, viewer, blocked } = await load(slug, g);
  if (blocked || !view) {
    return (
      <main className="stack" style={{ maxWidth: 520, margin: '0 auto', padding: '64px 16px', textAlign: 'center' }}>
        <GuestToken slug={slug} token={null} />
        <h1>{t("This celebration is for invited guests")}</h1>
        <p className="muted">{t("Open it from the link in your invitation. If you were invited and lost it, ask the host to send it again.")}</p>
        <p><Link href="/">{t("Blessly")}</Link></p>
      </main>
    );
  }
  const c = view.celebration;
  const tz = c.timezone;
  const start = new Date(c.startsAt);
  const date = new Intl.DateTimeFormat(intl, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: tz }).format(start);
  const time = new Intl.DateTimeFormat(intl, { hour: '2-digit', minute: '2-digit', timeZone: tz, timeZoneName: 'short' }).format(start);
  const end = c.endsAt ? new Intl.DateTimeFormat(intl, { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date(c.endsAt)) : null;
  const art = cardDesign(c.occasion, c.designIndex).art;
  const deadline = c.rsvpDeadline ? new Intl.DateTimeFormat(intl, { day: 'numeric', month: 'long', timeZone: tz }).format(new Date(c.rsvpDeadline)) : null;
  const closed = c.cancelled ? t('This celebration has been cancelled.') : c.past ? t('This celebration has happened — thanks to everyone who came!') : !view.me && c.rsvpDeadline && new Date(c.rsvpDeadline) < new Date() ? t('Replies have closed.') : null;
  const icsHref = `/c/${slug}/calendar.ics${view.me ? `?g=${encodeURIComponent(view.me.token)}` : ''}`;
  const mapHref = c.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([c.place, c.address].filter(Boolean).join(', '))}` : null;
  const celRow = await getDb().query.celebrations.findFirst({ where: eq(celTable.slug, slug) });
  const pots = celRow ? await potsFor(getDb(), { celebrationId: celRow.id }) : [];
  const wishes = view.posts.filter((p) => p.kind === 'wish'), memories = view.posts.filter((p) => p.kind === 'memory');
  const wall = (posts: typeof view.posts) => (
    <div className="wall">
      {posts.map((p) => (
        <article key={p.id} className="card-box stack" style={{ gap: 8, breakInside: 'avoid', marginBottom: 12 }}>
          {p.media?.kind === 'image' && <img src={p.media.url} alt={t("Photo from {name}", { name: p.name })} loading="lazy" style={{ width: '100%', borderRadius: 10, display: 'block' }} />}
          {p.media?.kind === 'video' && <video src={p.media.url} controls playsInline preload="metadata" style={{ width: '100%', borderRadius: 10 }} />}
          {p.message && <p style={{ margin: 0, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{p.message}</p>}
          <span className="muted small">— {p.name}{p.pending ? t(" · waiting for approval") : ''}</span>
        </article>
      ))}
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', backgroundImage: `linear-gradient(rgba(251,248,245,.88), rgba(251,248,245,.96)), url(${art.src})`, backgroundSize: 'cover', backgroundAttachment: 'fixed' }}>
      <GuestToken slug={slug} token={view.me?.token ?? null} />
      <main className="stack-lg" style={{ maxWidth: 640, margin: '0 auto', padding: '28px 16px 48px' }}>
        {view.isHost && <p className="notice">{t("You’re the host.")}{' '}<Link href="/celebrations">{t("Manage this celebration")}</Link></p>}
        <div style={{ maxWidth: 300, width: '100%', margin: '0 auto' }}>
          <GreetingCard occasion={c.occasion} designIndex={c.designIndex} greeting={GREETINGS[c.occasion].en} to={c.honoree ?? undefined} label={c.title} />
        </div>
        <header className="stack" style={{ textAlign: 'center', gap: 6 }}>
          <p className="eyebrow" style={{ margin: 0 }}>{view.me ? t("{name}, {hostName} invites you", { name: view.me.name, hostName: c.hostName }) : t("{hostName} invites you", { hostName: c.hostName })}</p>
          <h1 style={{ margin: 0 }}>{c.title}</h1>
          {c.cancelled && <p className="error" role="alert">{t("Cancelled")}</p>}
        </header>
        {!c.cancelled && <Countdown startsAt={c.startsAt} endsAt={c.endsAt} />}

        <section className="card-box stack" aria-label={t("Details")} style={{ gap: 10 }}>
          <p style={{ margin: 0 }}>📅 <b>{date}</b><br /><span style={{ marginLeft: 28 }}>{time}{end ? ` – ${end}` : ''}</span></p>
          {(c.place || c.address) && <p style={{ margin: 0 }}>📍 <b>{c.place}</b>{c.address && <><br /><span style={{ marginLeft: 28 }}>{c.address}</span></>}</p>}
          {c.onlineUrl && <p style={{ margin: 0 }}>💻 <a href={c.onlineUrl} target="_blank" rel="noopener noreferrer">{t("Join online")}</a></p>}
          {c.description && <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{c.description}</p>}
          <div className="row-wrap">
            <a className="btn btn-ghost btn-sm" href={icsHref}>{t("Add to calendar")}</a>
            {mapHref && <a className="btn btn-ghost btn-sm" href={mapHref} target="_blank" rel="noopener noreferrer">{t("Map")}</a>}
            {c.wishlistSlug && <Link className="btn btn-ghost btn-sm" href={`/l/${c.wishlistSlug}`}>{t("🎁 Gift wishlist")}</Link>}
            {pots.map((p) => <Link key={p.slug} className="btn btn-ghost btn-sm" href={`/p/${p.slug}`}>{t("💝 {title} · {v} raised", { title: p.title, v: formatMoney(p.raised, p.currency) })}</Link>)}
          </div>
        </section>

        {view.updates.length > 0 && (
          <section className="stack" aria-labelledby="upd"><h2 id="upd">{t("Updates from {v}", { v: c.hostName.split(' ')[0] })}</h2>
            {view.updates.map((u) => <p key={u.id} className="notice" style={{ margin: 0, whiteSpace: 'pre-line' }}>{u.body}<br /><span className="small muted">{new Date(u.createdAt).toLocaleDateString(intl, { day: 'numeric', month: 'short' })}</span></p>)}
          </section>
        )}

        {c.rsvpEnabled && !view.isHost && (
          <section className="card-box stack" aria-labelledby="rsvp">
            <h2 id="rsvp">{t("Can you come?")}</h2>
            {deadline && !closed && <p className="muted small" style={{ margin: 0 }}>{t("Please reply by {deadline}.", { deadline })}</p>}
            <RsvpBox slug={slug} me={view.me} maxPartySize={c.maxPartySize} askDiet={c.askDiet} askAccess={c.askAccess} hostName={c.hostName} closed={closed} />
          </section>
        )}
        {(view.counts.yes > 0 || view.coming.length > 0) && (
          <p className="muted small" style={{ textAlign: 'center', margin: 0 }}>{tp(view.counts.yes, "{n} person is coming", "{n} people are coming")}{view.coming.length ? `: ${view.coming.join(', ')}` : ''}</p>
        )}

        {c.past && memories.length > 0 && <section className="stack" aria-labelledby="mem"><h2 id="mem">{t("Memories")}</h2>{wall(memories)}</section>}
        {(wishes.length > 0 || c.guestPosts) && (
          <section className="stack" aria-labelledby="wall">
            <h2 id="wall">{c.honoree ? t("Messages for {honoree}", { honoree: c.honoree }) : t("Messages")}{wishes.length ? ` · ${wishes.length}` : ''}</h2>
            {wishes.length === 0 && <p className="muted">{t("Be the first to leave a message")}{c.honoree ? t(" for {honoree}", { honoree: c.honoree }) : ''}.</p>}
            {wall(wishes)}
          </section>
        )}
        {!c.past && memories.length > 0 && <section className="stack" aria-labelledby="mem"><h2 id="mem">{t("From the day")}</h2>{wall(memories)}</section>}
        {c.guestPosts && !c.cancelled && (
          <section className="card-box stack" aria-labelledby="post"><h2 id="post">{c.past ? t("Share a photo or memory") : t("Leave a message")}</h2>
            <PostForm slug={slug} token={view.me?.token ?? null} defaultName={view.me?.name ?? viewer?.name ?? ''} memory={c.past} />
          </section>
        )}
        <p className="small" style={{ textAlign: 'center' }}><Link href="/">{t("Made with Blessly · plan your own celebration free")}</Link></p>
        <div className="row" style={{ justifyContent: 'center' }}><LanguagePicker /></div>
      </main>
    </div>
  );
}
