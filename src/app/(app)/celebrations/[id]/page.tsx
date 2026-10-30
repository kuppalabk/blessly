import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/server/db';
import { AppError } from '@/server/errors';
import { pageUser } from '@/server/http';
import { hostView, isPast } from '@/server/services/celebrations';
import { listWishlists } from '@/server/services/wishlists';
import { HostDashboard } from '@/components/celebrations/HostDashboard';
import { moneyEnabled } from '@/server/services/money';
import { Icon } from '@/components/Icon';
import type { OccasionId } from '@/lib/i18n-data';
import { getT } from '@/server/i18n';

export async function generateMetadata() {
  const { t, intl } = await getT();
  return { title: t("Celebration") };
}

const local = (d: Date, tz: string, part: 'date' | 'time') => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
  return part === 'date' ? `${p.year}-${p.month}-${p.day}` : `${p.hour}:${p.minute}`;
};

export default async function CelebrationHost({ params }: { params: Promise<{ id: string }> }) {
  const { t, intl } = await getT();
  const user = await pageUser();
  const v = await hostView(getDb(), user.id, (await params).id).catch((e) => { if (e instanceof AppError && e.status === 404) notFound(); throw e; });
  const c = v.celebration;
  const wishlists = (await listWishlists(getDb(), user.id)).map((w) => ({ id: w.id, title: w.title }));
  const whenText = new Intl.DateTimeFormat(intl, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: c.timezone }).format(c.startsAt);
  return (
    <div className="stack-lg" style={{ maxWidth: 1000 }}>
      <header className="row">
        <Link href="/celebrations" className="btn btn-ghost btn-sm" aria-label={t("Back to celebrations")}><Icon name="back" size={18} /></Link>
        <div><h1>{c.title}</h1><p className="muted small" style={{ margin: 0 }}>{whenText}{c.place ? ` · ${c.place}` : ''}</p></div>
      </header>
      <HostDashboard
        id={c.id} title={c.title} slug={c.slug} appUrl={process.env.APP_URL ?? ''} whenText={whenText} past={isPast(c)} cancelled={!!c.cancelledAt} visibility={c.visibility}
        guests={v.guests.map((g) => ({ id: g.id, name: g.name, email: g.email, phone: g.phone, status: g.status, partySize: g.partySize, diet: g.diet, access: g.access, note: g.note, invitedAt: g.invitedAt?.toISOString() ?? null, token: g.token, selfAdded: g.selfAdded }))}
        posts={v.posts.map((p) => ({ id: p.id, name: p.name, message: p.message, approved: p.approved, kind: p.kind, createdAt: p.createdAt.toISOString(), media: p.media }))}
        updates={v.updates.map((u) => ({ id: u.id, body: u.body, createdAt: u.createdAt.toISOString(), emailed: u.emailed }))}
        summary={v.summary}
        wishlists={wishlists}
        money={moneyEnabled()}
        form={{
          title: c.title, occasion: c.occasion as OccasionId, honoree: c.honoree ?? '', description: c.description ?? '', date: local(c.startsAt, c.timezone, 'date'), time: local(c.startsAt, c.timezone, 'time'),
          endTime: c.endsAt ? local(c.endsAt, c.timezone, 'time') : '', timezone: c.timezone, place: c.place ?? '', address: c.address ?? '', onlineUrl: c.onlineUrl ?? '', designIndex: c.designIndex,
          visibility: c.visibility as 'public' | 'link' | 'invite', rsvpEnabled: c.rsvpEnabled, rsvpDeadline: c.rsvpDeadline ? local(c.rsvpDeadline, c.timezone, 'date') : '', askDiet: c.askDiet, askAccess: c.askAccess,
          maxPartySize: c.maxPartySize, guestPosts: c.guestPosts, moderatePosts: c.moderatePosts, showGuestList: c.showGuestList, wishlistId: c.wishlistId ?? ''
        }}
      />
    </div>
  );
}
