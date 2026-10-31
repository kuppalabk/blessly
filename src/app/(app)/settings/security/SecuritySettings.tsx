'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/components/api';
import { useT } from '@/components/I18n';

type Options = { hasPassword: boolean; phone: string | null; mfa: boolean; recoveryCodesLeft: number; identities: { provider: 'google' | 'apple'; email: string | null }[]; sessions: number };
const NAMES = { google: 'Google', apple: 'Apple' } as const;

export function SecuritySettings({ options, providers, phoneAvailable, adminRequired, isAdmin }: { options: Options; providers: ('google' | 'apple')[]; phoneAvailable: boolean; adminRequired: boolean; isAdmin: boolean }) {
  const { t, tp } = useT();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [phone, setPhone] = useState('');
  const [phoneStep, setPhoneStep] = useState<{ token: string; phone: string; devCode?: string } | null>(null);
  const [phoneCode, setPhoneCode] = useState('');
  const [pw, setPw] = useState({ current: '', next: '' });

  async function run(key: string, fn: () => Promise<string | void>) {
    setBusy(key); setError(null); setMsg(null);
    try { const m = await fn(); if (m) setMsg(m); router.refresh(); } catch (e) { setError(e instanceof Error ? e.message : t("Something went wrong")); } finally { setBusy(null); }
  }

  return (
    <div className="stack-lg">
      {adminRequired && !options.mfa && <p className="notice" role="alert">{t("Admins must turn on two-step verification before using the admin area.")}</p>}
      {msg && <p className="notice" role="status">{msg}</p>}
      {error && <p className="error" role="alert">{error}</p>}

      <section className="card-box stack" aria-labelledby="mfa">
        <h2 id="mfa" style={{ margin: 0 }}>{t("Two-step verification")}{' '}{options.mfa ? <span className="badge badge-green">{t("On")}</span> : <span className="badge">{t("Off")}</span>}</h2>
        <p className="muted small" style={{ margin: 0 }}>{t("After your password (or Google, Apple or a text code), you’ll also enter a code from an authenticator app such as Google Authenticator, Microsoft Authenticator or 1Password.")}</p>
        {codes && (
          <div className="stack card-box" style={{ background: 'var(--accent-soft)' }}>
            <b>{t("Save your recovery codes")}</b>
            <p className="small" style={{ margin: 0 }}>{t("If you lose your phone, each code lets you in once. Keep them somewhere safe — they won’t be shown again.")}</p>
            <pre className="code" data-testid="recovery-codes" style={{ columns: 2, margin: 0 }}>{codes.join('\n')}</pre>
            <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => { void navigator.clipboard?.writeText(codes.join('\n')); setMsg(t("Copied")); }}>{t("Copy codes")}</button>
            <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setCodes(null)}>{t("I’ve saved them")}</button>
          </div>
        )}
        {!options.mfa && !setup && <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} disabled={!!busy} onClick={() => run('setup', async () => { setSetup(await api('/api/me/2fa', { body: { action: 'setup' } })); })}>{t("Turn on")}</button>}
        {!options.mfa && setup && (
          <form className="stack" onSubmit={(e) => { e.preventDefault(); void run('confirm', async () => { const r = await api<{ recoveryCodes: string[] }>('/api/me/2fa', { body: { action: 'confirm', code } }); setCodes(r.recoveryCodes); setSetup(null); setCode(''); return t('Two-step verification is on.'); }); }}>
            <p className="small" style={{ margin: 0 }}>{t("1. Scan this with your authenticator app:")}</p>
            <img src={setup.qr} alt={t("QR code for your authenticator app")} width={180} height={180} style={{ background: '#fff', borderRadius: 12, padding: 8 }} />
            <p className="small" style={{ margin: 0 }}>{t("Can’t scan? Enter this key:")}{' '}<code data-testid="totp-secret" style={{ wordBreak: 'break-all' }}>{setup.secret}</code></p>
            <label className="field">{t("2. Enter the 6-digit code it shows")}<input className="input" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={7} /></label>
            <div className="row-wrap"><button className="btn btn-sm" disabled={busy === 'confirm' || code.trim().length < 6}>{t("Confirm and turn on")}</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setSetup(null)}>{t("Cancel")}</button></div>
          </form>
        )}
        {options.mfa && (
          <form className="stack" onSubmit={(e) => e.preventDefault()}>
            <p className="small" style={{ margin: 0 }}>{tp(options.recoveryCodesLeft, "{n} recovery code left.", "{n} recovery codes left.")}</p>
            <label className="field">{t("Code from your app (to make changes)")}<input className="input" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" maxLength={20} /></label>
            <div className="row-wrap">
              <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy || code.trim().length < 6} onClick={() => run('rec', async () => { const r = await api<{ recoveryCodes: string[] }>('/api/me/2fa', { body: { action: 'recovery', code } }); setCodes(r.recoveryCodes); setCode(''); })}>{t("New recovery codes")}</button>
              {!isAdmin && <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy || code.trim().length < 6} onClick={() => run('off', async () => { await api('/api/me/2fa', { body: { action: 'disable', code } }); setCode(''); return t('Two-step verification is off.'); })}>{t("Turn off")}</button>}
            </div>
          </form>
        )}
      </section>

      <section className="card-box stack" aria-labelledby="ways">
        <h2 id="ways" style={{ margin: 0 }}>{t("Ways to sign in")}</h2>
        <div className="item" style={{ border: 0, padding: 0 }}><span className="grow"><b>{t("Password")}</b><br /><span className="muted small">{options.hasPassword ? t("Set") : t("Not set — you sign in with the options below")}</span></span></div>
        <form className="stack" onSubmit={(e) => { e.preventDefault(); void run('pw', async () => { await api('/api/me/password', { body: pw }); setPw({ current: '', next: '' }); return options.hasPassword ? t('Password changed.') : t('Password set.'); }); }}>
          {options.hasPassword && <label className="field">{t("Current password")}<input className="input" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></label>}
          <label className="field">{options.hasPassword ? t("New password") : t("Set a password")}<input className="input" type="password" autoComplete="new-password" minLength={8} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></label>
          <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} disabled={busy === 'pw' || pw.next.length < 8}>{options.hasPassword ? t("Change password") : t("Set password")}</button>
        </form>
        {providers.map((p) => {
          const linked = options.identities.find((i) => i.provider === p);
          return (
            <div key={p} className="row between" style={{ gap: 8 }}>
              <span><b>{NAMES[p]}</b><br /><span className="muted small">{linked ? `Connected${linked.email ? ` · ${linked.email}` : ''}` : t("Not connected")}</span></span>
              {linked
                ? <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => run('un' + p, async () => { await api(`/api/me/identities/${p}`, { method: 'DELETE' }); return `${NAMES[p]} disconnected.`; })}>{t("Disconnect")}</button>
                : <a className="btn btn-ghost btn-sm" href={`/api/auth/oauth/${p}?link=1`}>{t("Connect")}</a>}
            </div>
          );
        })}
        {options.identities.filter((i) => !providers.includes(i.provider)).map((i) => <p key={i.provider} className="small muted">{t("{provider} connected", { provider: NAMES[i.provider] })}{i.email ? ` · ${i.email}` : ''}</p>)}
        {(phoneAvailable || options.phone) && (
          <div className="stack" style={{ gap: 8 }}>
            <div className="row between"><span><b>{t("Mobile number")}</b><br /><span className="muted small">{options.phone ? t("{phone} · sign in with a text code", { phone: options.phone }) : t("Add one to sign in with a text-message code")}</span></span>
              {options.phone && <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => run('rmphone', async () => { await api('/api/me/phone', { method: 'DELETE' }); return t('Number removed.'); })}>{t("Remove")}</button>}</div>
            {!phoneStep ? (
              <form className="row-wrap" onSubmit={(e) => { e.preventDefault(); void run('phone', async () => { setPhoneStep(await api('/api/me/phone', { body: { phone } })); }); }}>
                <input className="input grow" type="tel" aria-label={t("Mobile number")} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" style={{ minWidth: 180 }} />
                <button className="btn btn-ghost btn-sm" disabled={busy === 'phone' || phone.trim().length < 6}>{options.phone ? t("Change number") : t("Add number")}</button>
              </form>
            ) : (
              <form className="stack" onSubmit={(e) => { e.preventDefault(); void run('phone2', async () => { await api('/api/me/phone', { body: { token: phoneStep.token, code: phoneCode } }); setPhoneStep(null); setPhoneCode(''); setPhone(''); return t('Number verified.'); }); }}>
                <p className="small" style={{ margin: 0 }}>{t("We texted a code to {phone}.", { phone: phoneStep.phone })}</p>
                {phoneStep.devCode && <p className="notice" data-testid="dev-code">{t("Development mode — your code is")}{' '}<b>{phoneStep.devCode}</b></p>}
                <div className="row-wrap"><input className="input" aria-label={t("Code")} value={phoneCode} onChange={(e) => setPhoneCode(e.target.value)} inputMode="numeric" maxLength={6} style={{ width: 140 }} /><button className="btn btn-sm" disabled={phoneCode.length !== 6}>{t("Verify")}</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setPhoneStep(null)}>{t("Cancel")}</button></div>
              </form>
            )}
          </div>
        )}
      </section>

      <section className="card-box stack" aria-labelledby="sess">
        <h2 id="sess" style={{ margin: 0 }}>{t("Signed-in devices")}</h2>
        <p className="muted small" style={{ margin: 0 }}>{tp(options.sessions, "You’re signed in on {n} device (including this one).", "You’re signed in on {n} devices (including this one).")}</p>
        <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} disabled={!!busy || options.sessions < 2} onClick={() => run('out', async () => { await api('/api/me/security', { method: 'DELETE' }); return t('Signed out everywhere else.'); })}>{t("Sign out of other devices")}</button>
      </section>
    </div>
  );
}
