import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { pageUser } from '@/server/http';
import { AppError } from '@/server/errors';
import { people } from '@/server/schema';
import { getEvent } from '@/server/services/family';
import { formatDate, fromISO, toISO, todayIn } from '@/lib/dates';
import { cardDesign } from '@/lib/cards';
import { OCCASIONS, type OccasionId } from '@/lib/i18n-data';
import { Icon } from '@/components/Icon';
import { Avatar } from '@/components/family/Avatar';
import { TaskBoard } from '@/components/family/TaskBoard';
import { EventForm } from '@/components/family/EventForm';
import { DeleteEvent, RsvpButtons, StartCard } from './EventActions';
import { getT } from '@/server/i18n';
import { msg } from '@/lib/i18n/ui';

export async function generateMetadata() {
  const { t, intl, tp } = await getT();
  return { title: t("Family event") };
}

const RSVP_LABEL = { going: msg('Going'), maybe: msg('Maybe'), no: msg('Can’t go') } as const;

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { t, intl, tp } = await getT();
  const user = await pageUser();
  const { id } = await params;
  const v = await getEvent(getDb(), user.id, id, user.timezone).catch((e) => { if (e instanceof AppError && e.status === 404) notFound(); throw e; });
  const { event: e } = v;
  const date = fromISO(e.eventDate);
  const occasion = (OCCASIONS.some((o) => o.id === e.occasion) ? e.occasion : 'birthday') as OccasionId;
  const art = cardDesign(occasion, 0).art;
  const signed = v.card?.signedBy.length ?? 0;
  const total = v.members.length;
  const shared = v.me.canChange ? await getDb().select({ id: people.id, name: people.name }).from(people).where(eq(people.familyId, e.familyId)) : [];
  const counts = { going: 0, maybe: 0, no: 0 };
  for (const m of v.members) if (m.rsvp) counts[m.rsvp]++;
  return (
    <div className="stack-lg" style={{ maxWidth: 960 }}>
      <header className="row">
        <Link href={`/family/${e.familyId}`} aria-label={t("Back to {name}", { name: v.family.name })} className="btn btn-ghost btn-sm"><Icon name="back" size={18} /></Link>
        <div className="grow"><p className="muted small">{v.family.name}</p><h1>{e.title}</h1></div>
      </header>

      <section className="hero stack" style={{ backgroundImage: `linear-gradient(rgba(30,27,46,.72), rgba(30,27,46,.88)), url(${art.src})`, backgroundSize: 'cover', backgroundPosition: 'center' }} aria-label={t("Event details")}>
        <p className="eyebrow" style={{ color: '#9FD9BF' }}>{v.daysAway === 0 ? t("Today") : v.daysAway === 1 ? t("Tomorrow") : v.daysAway > 1 ? t("In {daysAway} days", { daysAway: v.daysAway }) : t("Past event")}</p>
        <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22 }}>{formatDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}{e.eventTime ? ` · ${e.eventTime}` : ''}</p>
        {e.place && <p className="row" style={{ gap: 6 }}><Icon name="pin" size={18} />{e.place}</p>}
        {v.person && <p className="small" style={{ color: '#E4E1EC' }}>{t("For")}{' '}<Link href={`/people/${v.person.id}`} style={{ color: '#fff' }}>{v.person.name}</Link></p>}
        {e.notes && <p className="small" style={{ color: '#E4E1EC', whiteSpace: 'pre-wrap' }}>{e.notes}</p>}
      </section>

      <div className="two-col">
        <section className="stack" aria-labelledby="coming">
          <h2 id="coming">{t("Are you coming?")}</h2>
          <RsvpButtons eventId={e.id} current={v.me.rsvp} />
          <p className="small muted">{t("{going} going · {maybe} maybe · {no} can’t go · {waiting} not replied", { going: counts.going, maybe: counts.maybe, no: counts.no, waiting: total - counts.going - counts.maybe - counts.no })}</p>
          <ul className="list" aria-label={t("Replies")}>
            {v.members.map((m) => (
              <li key={m.userId} className="item">
                <Avatar name={m.name} id={m.userId} small />
                <span className="grow">{m.userId === user.id ? t("{name} (you)", { name: m.name }) : m.name}</span>
                <span className={`badge ${m.rsvp === 'going' ? 'badge-green' : ''}`}>{m.rsvp ? t(RSVP_LABEL[m.rsvp]) : t("No reply")}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card-box stack" aria-labelledby="card-h">
          <h2 id="card-h">{t("Group card")}</h2>
          {v.card ? (
            <>
              <p className="muted">{t("Everyone signs one card")}{v.person ? t(" for {v}", { v: v.person.name.split(' ')[0] }) : ''}{t(". Send it on the day.")}</p>
              <div className="stack" style={{ gap: 6 }}>
                <div className="row between small"><b>{t("{signed} of {total} family signed", { signed, total })}</b><span className="muted">{tp(v.card.signatureCount, "{n} message", "{n} messages")}</span></div>
                <div className="progress" role="progressbar" aria-label={t("Family signatures")} aria-valuemin={0} aria-valuemax={total} aria-valuenow={signed}><span style={{ width: `${Math.round((signed / Math.max(1, total)) * 100)}%` }} /></div>
              </div>
              <div className="row-wrap">{v.members.map((m) => <span key={m.userId} className={`badge ${v.card!.signedBy.includes(m.userId) ? 'badge-green' : ''}`}>{v.card!.signedBy.includes(m.userId) ? '✓ ' : ''}{m.name.split(' ')[0]}</span>)}</div>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <Link className="btn grow" href={`/w/${v.card.slug}`}>{v.card.signedBy.includes(user.id) ? t("Open the card") : t("Sign the card")}</Link>
                {v.card.ownedByMe && <Link className="btn btn-ghost grow" href={`/wishes/${v.card.wishId}`}>{t("Send or schedule")}</Link>}
              </div>
            </>
          ) : v.me.canEdit ? (
            <>
              <p className="muted">{t("Start one card that the whole family signs. We’ll write the first message and let everyone know.")}</p>
              <StartCard eventId={e.id} />
            </>
          ) : <p className="muted">{t("No group card yet.")}</p>}
        </section>
      </div>

      <section className="stack" aria-labelledby="tasks">
        <h2 id="tasks">{t("Who’s doing what")}</h2>
        <TaskBoard familyId={e.familyId} eventId={e.id} tasks={v.tasks} members={v.members} me={{ userId: user.id, canEdit: v.me.canEdit, canManage: v.me.role === 'owner' || v.me.role === 'admin' }} />
      </section>

      {v.me.canChange && (
        <section className="stack">
          <details className="add card-box">
            <summary className="row between"><b>{t("Edit event")}</b><Icon name="next" size={18} /></summary>
            <div style={{ marginTop: 14 }}>
              <EventForm familyId={e.familyId} eventId={e.id} people={shared} today={toISO(todayIn(user.timezone))}
                initial={{ title: e.title, occasion: e.occasion, eventDate: e.eventDate, eventTime: e.eventTime, place: e.place, notes: e.notes, personId: e.personId }} />
            </div>
          </details>
          <DeleteEvent eventId={e.id} familyId={e.familyId} title={e.title} />
        </section>
      )}
    </div>
  );
}
