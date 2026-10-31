import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/server/db';
import { currentUser } from '@/server/http';
import { AppError } from '@/server/errors';
import { userDetail } from '@/server/services/admin';
import { fmtDateTime } from '@/components/business/ui';
import { Icon } from '@/components/Icon';
import { UserActions } from './UserActions';
import { PlanGrant } from './PlanGrant';
import { entitlements, subscriptionsFor } from '@/server/services/billing';

export const dynamic = 'force-dynamic';

export default async function AdminUser({ params }: { params: Promise<{ id: string }> }) {
  const me = (await currentUser())!;
  const d = await userDetail(getDb(), (await params).id).catch((e) => { if (e instanceof AppError && e.status === 404) notFound(); throw e; });
  const u = d.user;
  const ent = await entitlements(getDb(), u.id);
  const subs = await subscriptionsFor(getDb(), u.id);
  return (
    <div className="stack-lg">
      <div className="row"><Link href="/admin/users" className="btn btn-ghost btn-sm" aria-label="All users"><Icon name="back" size={18} /></Link>
        <div className="grow"><h2>{u.name}</h2><p className="muted small">{u.email} · {u.country} · {u.timezone}</p></div>
        {u.suspendedAt ? <span className="badge badge-hot">Suspended</span> : u.role === 'admin' ? <span className="badge badge-purple">Admin</span> : <span className="badge badge-green">Active</span>}
      </div>
      {u.suspendedAt && <p className="notice">Suspended {fmtDateTime(u.suspendedAt, 'UTC')} UTC — {u.suspendedReason}</p>}
      <div className="two-col">
        <section className="card-box stack">
          <h3>Account</h3>
          <dl className="stack small" style={{ margin: 0, gap: 6 }}>
            <div className="row between"><dt className="muted">Joined</dt><dd style={{ margin: 0 }}>{fmtDateTime(u.createdAt, 'UTC')}</dd></div>
            <div className="row between"><dt className="muted">Last seen</dt><dd style={{ margin: 0 }}>{u.lastSeenAt ? fmtDateTime(u.lastSeenAt, 'UTC') : '—'}</dd></div>
            <div className="row between"><dt className="muted">Logged-in devices</dt><dd style={{ margin: 0 }}>{d.counts.activeSessions}</dd></div>
            <div className="row between"><dt className="muted">People / wishes</dt><dd style={{ margin: 0 }}>{d.counts.people} / {d.counts.wishes}</dd></div>
            <div className="row between"><dt className="muted">Scheduled sends</dt><dd style={{ margin: 0 }}>{d.counts.scheduledSends}</dd></div>
            <div className="row between"><dt className="muted">Push devices</dt><dd style={{ margin: 0 }}>{d.counts.pushDevices}</dd></div>
            <div className="row between"><dt className="muted">Family circles</dt><dd style={{ margin: 0 }}>{d.circles.length ? d.circles.map((c) => `${c.name} (${c.role})`).join(', ') : '—'}</dd></div>
            <div className="row between"><dt className="muted">Business</dt><dd style={{ margin: 0 }}>{d.business ? <Link href={`/admin/businesses?q=${encodeURIComponent(d.business.name)}`}>{d.business.name}</Link> : '—'}{d.business && ` · ${d.business.used}/${d.business.quota} this month${d.business.pausedAt ? ' · paused' : ''}`}</dd></div>
          </dl>
          <p className="muted small">For privacy, admins see counts — not people’s contacts or messages — unless they open a support view, which the user is told about.</p>
        </section>
        <section className="card-box stack">
          <h3>Actions</h3>
          <UserActions id={u.id} email={u.email} suspended={!!u.suspendedAt} protectedAccount={u.role === 'admin' || u.id === me.id} />
          <h3 style={{ marginTop: 8 }}>Plan</h3>
          <PlanGrant userId={u.id} current={ent.plan.name} subs={subs.map((s) => ({ id: s.id, planId: s.planId, provider: s.provider, status: s.status, amount: s.amount, currency: s.currency, interval: s.interval, currentPeriodEnd: s.currentPeriodEnd?.toISOString() ?? null, note: s.note }))} />
          <h3 style={{ marginTop: 8 }}>History</h3>
          {d.history.length === 0 ? <p className="muted small">No admin actions on this account.</p> : (
            <ul className="list small" style={{ gap: 4 }}>{d.history.map((h) => <li key={h.id}>{fmtDateTime(h.createdAt, 'UTC')} · <b>{h.action}</b> by {h.adminEmail}{h.details ? ` — ${h.details}` : ''}</li>)}</ul>
          )}
        </section>
      </div>
    </div>
  );
}
