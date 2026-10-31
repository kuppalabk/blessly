'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/components/api';
import { Icon } from '@/components/Icon';
import { ErrorMessage } from '@/components/ErrorMessage';
import { useT } from '@/components/I18n';
import { msg } from '@/lib/i18n/ui';

type Invite = { id: string; token: string; role: string; expiresAt: string };
const ROLE: Record<string, string> = { admin: msg('Admin'), member: msg('Member'), viewer: msg('Can view') };

export function InviteBox({ familyId, familyName, inviter, invites, isOwner, seatsLeft, limit }: { familyId: string; familyName: string; inviter: string; invites: Invite[]; isOwner: boolean; seatsLeft: number; limit: number }) {
  const { t: tr, intl } = useT();
  const router = useRouter();
  const [role, setRole] = useState('member');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);

  const linkFor = (t: string) => `${origin}/join/${t}`;
  const message = (tok: string) => tr('{inviter} invited you to {family} on Blessly — we’ll share birthdays, plan family events and sign cards together. Join here: {link}', { inviter, family: familyName, link: linkFor(tok) });

  async function create() {
    setBusy(true); setError(null);
    try { await api(`/api/families/${familyId}/invites`, { body: { role } }); router.refresh(); } catch (e) { setError(e); }
    setBusy(false);
  }
  async function copy(inv: Invite) {
    try { await navigator.clipboard.writeText(linkFor(inv.token)); setCopied(inv.id); setTimeout(() => setCopied(null), 2000); } catch { setError(tr("Copy failed — press and hold the link to copy it")); }
  }
  async function share(inv: Invite) {
    if (navigator.share) { try { await navigator.share({ title: tr('Join {family}', { family: familyName }), text: message(inv.token) }); } catch { /* cancelled */ } }
    else copy(inv);
  }

  return (
    <div className="stack">
      {seatsLeft > 0 ? (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <label className="grow field" style={{ minWidth: 160 }}>{tr("Invite as")}<select className="select" aria-label={tr("Invite as")} value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="member">{tr("Member — can add events and tasks")}</option>
              <option value="viewer">{tr("Can view — sees and RSVPs")}</option>
              {isOwner && <option value="admin">{tr("Admin — can also invite and remove")}</option>}
            </select>
          </label>
          <button className="btn" style={{ alignSelf: 'flex-end' }} onClick={create} disabled={busy}><Icon name="link" size={18} />{busy ? tr("Creating…") : tr("Create invite link")}</button>
        </div>
      ) : <p className="notice">{tr("Your circle is full ({n} people).", { n: limit })}{limit < 6 && isOwner ? <> <a href="/plans">{tr("Upgrade to Family")}</a> {' '}{tr("for up to 6.")}</> : null}</p>}
      {invites.map((inv) => (
        <div key={inv.id} className="card-box stack" style={{ gap: 10 }}>
          <div className="row between small"><b>{tr('{role} invite', { role: tr(ROLE[inv.role] ?? inv.role) })}</b><span className="muted">{tr("Expires")}{' '}{new Date(inv.expiresAt).toLocaleDateString(intl, { day: 'numeric', month: 'short' })}</span></div>
          <div className="link-box"><code data-testid="invite-link">{origin ? linkFor(inv.token) : `/join/${inv.token}`}</code><button className="btn btn-ghost btn-sm" onClick={() => copy(inv)}>{copied === inv.id ? tr("Copied") : tr("Copy")}</button></div>
          <div className="row" style={{ gap: 8 }}>
            <a className="btn btn-sm grow" style={{ background: '#1F7A4D' }} href={`https://wa.me/?text=${encodeURIComponent(message(inv.token))}`} target="_blank" rel="noopener noreferrer"><Icon name="whatsapp" size={18} />{tr("WhatsApp")}</a>
            <button className="btn btn-ghost btn-sm grow" onClick={() => share(inv)}><Icon name="share" size={18} />{tr("Share")}</button>
            <button className="btn btn-ghost btn-sm" onClick={async () => { await api(`/api/families/${familyId}/invites/${inv.id}`, { method: 'DELETE' }).catch(() => {}); router.refresh(); }}>{tr("Cancel")}</button>
          </div>
        </div>
      ))}
      <ErrorMessage error={error} />
    </div>
  );
}
