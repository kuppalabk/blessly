import Link from 'next/link';
import { getDb } from '@/server/db';
import { pageUser } from '@/server/http';
import { isPast, listCelebrations } from '@/server/services/celebrations';
import { GreetingCard } from '@/components/GreetingCard';
import { GREETINGS, type OccasionId } from '@/lib/i18n-data';
import { getT } from '@/server/i18n';

export async function generateMetadata() {
  const { t, intl } = await getT();
  return { title: t("Celebrations") };
}

export default async function Celebrations() {
  const { t, intl } = await getT();
  const user = await pageUser();
  const list = await listCelebrations(getDb(), user.id);
  const fmt = (d: Date, tz: string) => new Intl.DateTimeFormat(intl, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: tz }).format(d);
  const upcoming = list.filter((c) => !isPast(c)), past = list.filter((c) => isPast(c));
  const grid = (xs: typeof list) => (
    <div className="grid-cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
      {xs.map((c) => (
        <Link key={c.id} href={`/celebrations/${c.id}`} className="card-box stack" style={{ textDecoration: 'none', color: 'var(--ink)', gap: 8 }}>
          <div style={{ maxWidth: 120 }}><GreetingCard occasion={c.occasion as OccasionId} designIndex={c.designIndex} greeting={GREETINGS[c.occasion as OccasionId].en} label="" /></div>
          <b>{c.title}</b>
          <span className="muted small">{fmt(c.startsAt, c.timezone)}{c.cancelledAt ? t(" · cancelled") : ''}</span>
          <span className="small">{t("{coming} coming · {guests} on the guest list", { coming: c.coming, guests: c.guests })}</span>
        </Link>
      ))}
    </div>
  );
  return (
    <div className="stack-lg" style={{ maxWidth: 1000 }}>
      <header className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div><h1>{t("Celebrations")}</h1><p className="muted small" style={{ margin: 0 }}>{t("A page for your party or event: invitations and RSVPs, a countdown, and a wall of messages, photos and memories.")}</p></div>
        <Link className="btn" href="/celebrations/new">{t("Plan a celebration")}</Link>
      </header>
      {list.length === 0 && <p className="muted">{t("Nothing planned yet.")}</p>}
      {upcoming.length > 0 && <section className="stack"><h2>{t("Coming up")}</h2>{grid(upcoming)}</section>}
      {past.length > 0 && <section className="stack"><h2>{t("Past")}</h2>{grid(past)}</section>}
    </div>
  );
}
