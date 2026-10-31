'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/components/api';
import { Avatar } from '@/components/family/Avatar';
import { useT } from '@/components/I18n';
import { msg } from '@/lib/i18n/ui';

type Role = 'owner' | 'admin' | 'member' | 'viewer';
type Member = { userId: string; name: string; email: string | null; role: Role; notify: boolean };
const LABEL: Record<Role, string> = { owner: msg('Owner'), admin: msg('Admin'), member: msg('Member'), viewer: msg('Can view') };
const RANK: Record<Role, number> = { owner: 3, admin: 2, member: 1, viewer: 0 };

export function Members({ familyId, familyName, members, me }: { familyId: string; familyName: string; members: Member[]; me: { userId: string; role: Role } }) {
  const { t } = useT();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const isManager = me.role === 'owner' || me.role === 'admin';

  async function run(key: string, fn: () => Promise<unknown>, after?: () => void) {
    setBusy(key); setError(null);
    try { await fn(); after ? after() : router.refresh(); } catch (e) { setError(e instanceof Error ? e.message : t("Something went wrong")); }
    setBusy(null); setConfirm(null);
  }

  const mine = members.find((m) => m.userId === me.userId)!;
  return (
    <div className="stack">
      <ul className="list">
        {members.map((m) => {
          const self = m.userId === me.userId;
          const canRemove = !self && isManager && RANK[m.role] < RANK[me.role];
          return (
            <li key={m.userId} className="item" style={{ flexWrap: 'wrap' }}>
              <Avatar name={m.name} id={m.userId} />
              <span className="grow"><b>{m.name}{self ? t(" (you)") : ''}</b>{m.email && <><br /><span className="muted small">{m.email}</span></>}</span>
              {me.role === 'owner' && !self ? (
                <select className="select" style={{ width: 'auto', minHeight: 40 }} aria-label={t("Role for {name}", { name: m.name })} value={m.role} disabled={busy === m.userId}
                  onChange={(e) => {
                    const role = e.target.value as Role;
                    if (role === 'owner' && !window.confirm(t("Make {name} the owner? You'll become an admin.", { name: m.name }))) return;
                    run(m.userId, () => api(`/api/families/${familyId}/members/${m.userId}`, { method: 'PATCH', body: { role } }));
                  }}>
                  {(['admin', 'member', 'viewer', 'owner'] as Role[]).map((r) => <option key={r} value={r}>{r === 'owner' ? t("Make owner") : t(LABEL[r])}</option>)}
                </select>
              ) : <span className={`badge ${m.role === 'owner' ? 'badge-purple' : ''}`}>{t(LABEL[m.role])}</span>}
              {canRemove && (confirm === m.userId ? (
                <span className="row" style={{ gap: 6, width: '100%', justifyContent: 'flex-end' }}>
                  <span className="small">{t("Remove {v}?", { v: m.name.split(' ')[0] })}</span>
                  <button className="btn btn-danger btn-sm" disabled={busy === m.userId} onClick={() => run(m.userId, () => api(`/api/families/${familyId}/members/${m.userId}`, { method: 'DELETE' }))}>{t("Remove")}</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setConfirm(null)}>{t("Cancel")}</button>
                </span>
              ) : <button className="btn btn-ghost btn-sm" aria-label={t("Remove {name}", { name: m.name })} onClick={() => setConfirm(m.userId)}>{t("Remove")}</button>)}
            </li>
          );
        })}
      </ul>

      <div className="card-box row">
        <span className="grow"><b>{t("Remind me about shared dates")}</b><br /><span className="muted small">{t("Birthdays and anniversaries shared in {familyName}", { familyName })}</span></span>
        <button type="button" role="switch" className="switch" aria-checked={mine.notify} aria-label={t("Remind me about shared dates")} disabled={busy === 'notify'}
          onClick={() => run('notify', () => api(`/api/families/${familyId}/members/${me.userId}`, { method: 'PATCH', body: { notify: !mine.notify } }))} />
      </div>

      {confirm === 'leave' ? (
        <div className="card-box stack" role="alertdialog" aria-label={t("Confirm leaving")}>
          <p>{me.role === 'owner' && members.length === 1 ? t("You're the only one here, so leaving deletes {familyName}.", { familyName }) : t("Leave {familyName}? People you shared go back to private.", { familyName })}</p>
          <div className="row">
            <button className="btn btn-danger grow" disabled={busy === 'leave'} onClick={() => run('leave', () => api(`/api/families/${familyId}/members/${me.userId}`, { method: 'DELETE' }), () => { router.push('/family?all=1'); router.refresh(); })}>{t("Leave")}</button>
            <button className="btn btn-ghost grow" onClick={() => setConfirm(null)}>{t("Cancel")}</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-ghost" onClick={() => setConfirm('leave')} disabled={me.role === 'owner' && members.length > 1} title={me.role === 'owner' && members.length > 1 ? t("Make someone else the owner first") : undefined}>{t("Leave circle")}</button>
      )}
      {me.role === 'owner' && members.length > 1 && <p className="muted small">{t("To leave, first make someone else the owner.")}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
