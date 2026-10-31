import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/server/db';
import { pageUser } from '@/server/http';
import { AppError } from '@/server/errors';
import { getFamily, ROLE_LABEL } from '@/server/services/family';
import { daysBetween, formatDate, fromISO, toISO, todayIn } from '@/lib/dates';
import { Icon } from '@/components/Icon';
import { Avatar } from '@/components/family/Avatar';
import { TaskBoard } from '@/components/family/TaskBoard';
import { EventForm } from '@/components/family/EventForm';
import { Members } from './Members';
import { InviteBox } from './InviteBox';
import { getT } from '@/server/i18n';

export async function generateMetadata() {
  const { t, intl } = await getT();
  return { title: t("Family Circle") };
}

function when(days: number, T: Awaited<ReturnType<typeof getT>>) {
  return days === 0 ? T.t('Today') : days === 1 ? T.t('Tomorrow') : T.tp(days, 'In {n} day', 'In {n} days');
}

export default async function CirclePage({ params }: { params: Promise<{ id: string }> }) {
  const T = await getT();
  const { t: tr } = T;
  const user = await pageUser();
  const { id } = await params;
  const v = await getFamily(getDb(), user.id, id, user.timezone).catch((e) => { if (e instanceof AppError && e.status === 404) notFound(); throw e; });
  const today = todayIn(user.timezone);
  const eventTitle = new Map(v.events.map((e) => [e.id, e.title]));
  const openTasks = v.tasks.filter((t) => t.status !== 'done').length;
  return (
    <div className="stack-lg" style={{ maxWidth: 960 }}>
      <header className="row">
        <Link href="/family?all=1" aria-label={tr("All family circles")} className="btn btn-ghost btn-sm"><Icon name="back" size={18} /></Link>
        <div className="grow"><h1>{v.family.name}</h1><p className="muted small">{tr("{length} of {limit} people · you’re {v}", { length: v.members.length, limit: v.limit, v: ROLE_LABEL[v.me.role].toLowerCase() })}</p></div>
        <Link href="/calendar" className="btn btn-ghost btn-sm" aria-label={tr("Calendar")}><Icon name="calendar" size={18} /></Link>
      </header>

      <section className="hero stack" aria-label={tr("Circle summary")}>
        <div className="row between">
          <div className="avatar-stack" aria-label={tr("Members: {v}", { v: v.members.map((m) => m.name).join(', ') })}>{v.members.map((m) => <Avatar key={m.userId} name={m.name} id={m.userId} />)}</div>
          {v.me.canManage && v.seatsLeft > 0 && <a href="#invite" className="btn btn-sm" style={{ background: '#fff', color: 'var(--ink)' }}>{tr("+ Invite")}</a>}
        </div>
        <div className="row" style={{ gap: 24 }}>
          <p><b style={{ fontSize: 22, fontFamily: 'var(--font-display)' }}>{v.events.length}</b><br /><span className="muted small">{tr("upcoming events")}</span></p>
          <p><b style={{ fontSize: 22, fontFamily: 'var(--font-display)' }}>{openTasks}</b><br /><span className="muted small">{tr("open tasks")}</span></p>
          <p><b style={{ fontSize: 22, fontFamily: 'var(--font-display)' }}>{v.shared.length}</b><br /><span className="muted small">{tr("shared people")}</span></p>
        </div>
      </section>

      <div className="two-col">
        <section className="stack" aria-labelledby="events">
          <h2 id="events">{tr("Family events")}</h2>
          {v.events.length === 0 && <p className="muted">{tr("No events yet. Add a birthday dinner, a puja or a get-together.")}</p>}
          <ul className="list">
            {v.events.map((e) => {
              const d = fromISO(e.eventDate);
              const days = daysBetween(today, d);
              return (
                <li key={e.id}>
                  <Link className="item" href={`/family/events/${e.id}`}>
                    <span className="avatar" style={{ background: 'var(--green-soft)', color: 'var(--green)', flexDirection: 'column', lineHeight: 1 }}>
                      <span style={{ fontSize: 16 }}>{d.d}</span><span style={{ fontSize: 10, textTransform: 'uppercase' }}>{formatDate(d, { month: 'short' })}</span>
                    </span>
                    <span className="grow"><b>{e.title}</b><br /><span className="muted small">{when(days, T)}{e.eventTime ? ` · ${e.eventTime}` : ''} · {tr("{n} going", { n: e.rsvp.going })}{e.rsvp.maybe ? tr(", {maybe} maybe", { maybe: e.rsvp.maybe }) : ''}</span></span>
                    <span className={`badge ${e.myRsvp === 'going' ? 'badge-green' : !e.myRsvp ? 'badge-hot' : ''}`}>{e.myRsvp === 'going' ? tr("Going") : e.myRsvp === 'maybe' ? tr("Maybe") : e.myRsvp === 'no' ? tr("Can’t go") : tr("Reply")}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {v.me.canEdit && (
            <details className="add card-box">
              <summary className="row between"><b>{tr("+ Add a family event")}</b><Icon name="next" size={18} /></summary>
              <div style={{ marginTop: 14 }}><EventForm familyId={v.family.id} people={v.shared} today={toISO(today)} /></div>
            </details>
          )}
        </section>

        <section className="stack" aria-labelledby="shared">
          <div className="row between">
            <h2 id="shared">{tr("Shared dates")}</h2>
            {v.me.canEdit && <Link href={`/people/new?family=${v.family.id}`} className="btn btn-ghost btn-sm">{tr("+ Share someone")}</Link>}
          </div>
          <p className="muted small">{tr("Everyone here gets reminders for these people. Your other people stay private.")}</p>
          {v.shared.length === 0 && <p className="muted">{tr("Nobody shared yet — add grandparents, cousins and aunties so no one forgets.")}</p>}
          <ul className="list">
            {v.shared.map((p) => (
              <li key={p.id}>
                <Link className="item" href={`/people/${p.id}`}>
                  <Avatar name={p.name} id={p.id} />
                  <span className="grow"><b>{p.name}</b><br /><span className="muted small">{tr(p.relationship)} · {p.ownerId === user.id ? tr("shared by you") : tr("shared by {name}", { name: p.ownerName })}</span></span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="stack" aria-labelledby="tasks">
        <h2 id="tasks">{tr("Who’s doing what")}</h2>
        <TaskBoard familyId={v.family.id} members={v.members} me={{ userId: user.id, canEdit: v.me.canEdit, canManage: v.me.canManage }}
          tasks={v.tasks.map((t) => ({ ...t, title: t.eventId && eventTitle.get(t.eventId) ? `${t.title} · ${eventTitle.get(t.eventId)}` : t.title }))} />
      </section>

      <div className="two-col">
        <section className="stack" aria-labelledby="members">
          <h2 id="members">{tr("People in this circle")}</h2>
          <Members familyId={v.family.id} familyName={v.family.name} me={{ userId: user.id, role: v.me.role }} members={v.members} />
        </section>
        {v.me.canManage && (
          <section className="stack" aria-labelledby="invite-h" id="invite">
            <h2 id="invite-h">{tr("Invite relatives")}</h2>
            <p className="muted small">{tr("Send the link on WhatsApp or anywhere. It works for 7 days; anyone with it can join until the circle is full.")}</p>
            <InviteBox familyId={v.family.id} familyName={v.family.name} inviter={user.name} isOwner={v.me.role === 'owner'} seatsLeft={v.seatsLeft} limit={v.limit}
              invites={v.invites.map((i) => ({ id: i.id, token: i.token, role: i.role, expiresAt: i.expiresAt.toISOString() }))} />
          </section>
        )}
      </div>
    </div>
  );
}
