'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/components/api';
import { ErrorMessage } from '@/components/ErrorMessage';
import { useT } from '@/components/I18n';

type Member = { userId: string; name: string; email: string };
type Invite = { id: string; email: string; token: string; expiresAt: string };

export function Team({ owner, staff, invites, seats, isOwner, me }: { owner: Member; staff: Member[]; invites: Invite[]; seats: number; isOwner: boolean; me: string }) {
  const { t } = useT();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  const run = async (fn: () => Promise<unknown>) => { setError(null); try { await fn(); router.refresh(); } catch (e) { setError(e); } };
  const used = 1 + staff.length + invites.length;
  return (
    <section className="card-box stack" aria-labelledby="team-h">
      <h2 id="team-h" style={{ fontSize: 19 }}>{t("Team")}</h2>
      <p className="muted small">{t("{used} of {seats} logins used. Team members can manage customers, automations and campaigns; only the owner changes settings and WhatsApp.", { used, seats })}</p>
      <ul className="list" style={{ gap: 6 }}>
        <li className="row"><span className="grow"><b>{owner.name}</b><br /><span className="muted small">{owner.email}</span></span><span className="badge badge-purple">{t("Owner")}</span></li>
        {staff.map((s) => (
          <li key={s.userId} className="row"><span className="grow"><b>{s.name}</b><br /><span className="muted small">{s.email}</span></span>
            {(isOwner || s.userId === me) && <button className="btn btn-ghost btn-sm" onClick={() => run(async () => { await api(`/api/business/team/${s.userId}`, { method: 'DELETE' }); if (s.userId === me) window.location.assign('/home'); })}>{s.userId === me ? t("Leave") : t("Remove")}</button>}
          </li>
        ))}
        {invites.map((i) => (
          <li key={i.id} className="stack" style={{ gap: 4 }}>
            <div className="row"><span className="grow">{i.email} <span className="badge">{t("Invited")}</span></span>{isOwner && <button className="btn btn-ghost btn-sm" onClick={() => run(() => api(`/api/business/team/invites/${i.id}`, { method: 'DELETE' }))}>{t("Cancel")}</button>}</div>
            {isOwner && <div className="link-box"><code data-testid="staff-invite-link">{origin}/business/join/{i.token}</code></div>}
          </li>
        ))}
      </ul>
      {isOwner && (
        <form className="row" style={{ gap: 8, flexWrap: 'wrap' }} onSubmit={(e) => { e.preventDefault(); run(async () => { await api('/api/business/team', { body: { email } }); setEmail(''); }); }}>
          <label className="grow" style={{ minWidth: 200 }}><span className="sr-only">{t("Team member email")}</span><input className="input" type="email" aria-label={t("Team member email")} placeholder={t("colleague@example.com")} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <button className="btn">{t("Invite")}</button>
        </form>
      )}
      <ErrorMessage error={error} />
    </section>
  );
}
