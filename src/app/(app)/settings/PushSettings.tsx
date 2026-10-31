'use client';
import { useEffect, useState } from 'react';
import { api } from '@/components/api';
import { useT } from '@/components/I18n';

type State = 'loading' | 'unsupported' | 'ios-install' | 'off-server' | 'blocked' | 'off' | 'on';

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Turns phone/browser notifications on or off for this device. */
export function PushSettings() {
  const { t, tp } = useT();
  const [state, setState] = useState<State>('loading');
  const [devices, setDevices] = useState(0);
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone;
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return setState(ios && !standalone ? 'ios-install' : 'unsupported');
      const info = await api<{ publicKey: string | null; devices: number }>('/api/push').catch(() => ({ publicKey: null, devices: 0 }));
      setDevices(info.devices); setKey(info.publicKey);
      if (!info.publicKey) return setState('off-server');
      if (Notification.permission === 'denied') return setState('blocked');
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? 'on' : 'off');
    })();
  }, []);

  async function enable() {
    if (!key) return;
    setBusy(true); setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setState(perm === 'denied' ? 'blocked' : 'off'); return; }
      const reg = await navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready);
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
      const r = await api<{ devices: number }>('/api/push', { body: sub.toJSON() });
      setDevices(r.devices); setState('on');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : t("Could not turn on notifications"));
    } finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true); setMsg(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        const r = await api<{ devices: number }>('/api/push', { method: 'DELETE', body: { endpoint: sub.endpoint } });
        setDevices(r.devices);
        await sub.unsubscribe();
      }
      setState('off');
    } catch (e) { setMsg(e instanceof Error ? e.message : t("Could not turn off notifications")); } finally { setBusy(false); }
  }

  async function test() {
    setBusy(true); setMsg(null);
    try {
      const r = await api<{ sent: number }>('/api/push/test', { method: 'POST' });
      setMsg(r.sent ? t("Sent — check your notifications.") : t("No device received it. Try turning notifications off and on again."));
    } catch (e) { setMsg(e instanceof Error ? e.message : t("Could not send")); } finally { setBusy(false); }
  }

  const text: Record<State, string> = {
    loading: t('Checking this device…'),
    unsupported: t('This browser can’t show notifications. You’ll still get alerts in the app and by email.'),
    'ios-install': t('On iPhone and iPad, first add Blessly to your Home Screen (Share → Add to Home Screen), then open it from there to turn on notifications.'),
    'off-server': t('Phone notifications aren’t set up on this server yet. Alerts arrive in the app and by email.'),
    blocked: t('Notifications are blocked for Blessly. Allow them in your browser or phone settings, then come back here.'),
    off: t('Get reminders on this device a week before, the day before and on the day — even when Blessly is closed.'),
    on: devices > 1 ? tp(devices - 1, 'On for this device and {n} other.', 'On for this device and {n} others.') : t('On for this device.')
  };

  return (
    <section className="card-box stack" aria-labelledby="push-h">
      <div className="row between">
        <h2 id="push-h" style={{ fontSize: 18 }}>{t("Phone notifications")}</h2>
        {(state === 'on' || state === 'off') && (
          <button type="button" role="switch" className="switch" aria-checked={state === 'on'} aria-label={t("Phone notifications")} disabled={busy} onClick={state === 'on' ? disable : enable} />
        )}
      </div>
      <p className="muted small" role="status">{text[state]}</p>
      {state === 'on' && <button type="button" className="btn btn-ghost btn-sm" onClick={test} disabled={busy}>{t("Send a test notification")}</button>}
      {msg && <p className="small" role="alert">{msg}</p>}
    </section>
  );
}
