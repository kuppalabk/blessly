import { getDb } from '@/server/db';
import { systemHealth } from '@/server/services/admin';
import { fmtDateTime } from '@/components/business/ui';

export const dynamic = 'force-dynamic';

function Check({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return <li className="row" style={{ gap: 10, alignItems: 'flex-start' }}><span className={`badge ${ok ? 'badge-green' : ''}`} style={{ minWidth: 44, textAlign: 'center' }}>{ok ? 'On' : 'Off'}</span><span className="small"><b>{label}</b><br /><span className="muted">{hint}</span></span></li>;
}

export default async function AdminSystem() {
  const h = await systemHealth(getDb());
  return (
    <>
      <section className={h.healthy ? 'card-box stack' : 'notice stack'} aria-label="Status" style={h.healthy ? undefined : { background: 'var(--danger-soft)', color: 'var(--danger)' }}>
        <h2 style={{ fontSize: 18 }}>{h.healthy ? 'All systems normal' : 'Needs attention'}</h2>
        <p className="small">{h.minutesSinceRun === null ? 'The job runner has never run. Schedule POST /api/cron every minute or run npm run jobs.' : `Job runner last ran ${h.minutesSinceRun === 0 ? 'less than a minute' : `${h.minutesSinceRun} minute${h.minutesSinceRun === 1 ? '' : 's'}`} ago.`}
          {h.overdue.reminders ? ` ${h.overdue.reminders} reminders are overdue.` : ''}{h.overdue.sends ? ` ${h.overdue.sends} scheduled sends are overdue.` : ''}</p>
      </section>
      <section className="stats" aria-label="Queues">
        <div className="stat"><span className="muted small">Business messages queued</span><b>{h.bizQueued}</b></div>
        <div className="stat"><span className="muted small">Business failures (24h)</span><b>{h.bizFailed24h}</b></div>
        <div className="stat"><span className="muted small">Personal sends failed (30d)</span><b>{h.sendsFailed30d}</b></div>
        <div className="stat"><span className="muted small">Emails (24h)</span><b>{h.emails24h}</b></div>
      </section>
      <div className="two-col">
        <section className="card-box stack" aria-labelledby="cfg">
          <h2 id="cfg" style={{ fontSize: 18 }}>Configuration</h2>
          <ul className="list" style={{ gap: 10 }}>
            <Check ok={h.config.email} label="Email delivery (Resend)" hint="Without it, emails stay in the outbox table." />
            <Check ok={h.config.ai} label="AI wish writing" hint="Without it, built-in templates are used." />
            <Check ok={h.config.push} label="Push notifications (VAPID)" hint="Without it, alerts are in-app and email only." />
            <Check ok={h.config.encryption} label="Encryption key" hint="Needed for businesses to connect WhatsApp." />
            <Check ok={h.config.whatsappWebhook} label="WhatsApp webhook secrets" hint="Needed for delivery ticks and STOP replies." />
            <Check ok={h.config.cronSecret} label="Strong cron secret (16+ characters)" hint="Protects the job runner endpoint." />
          </ul>
        </section>
        <section className="card-box stack" aria-labelledby="runs">
          <h2 id="runs" style={{ fontSize: 18 }}>Recent job runs</h2>
          {h.runs.length === 0 && <p className="muted small">None yet.</p>}
          <ul className="list small" style={{ gap: 6 }}>
            {h.runs.map((r) => {
              const res = r.result ? JSON.parse(r.result) as Record<string, number> : null;
              return (
                <li key={r.id} className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                  <span className={`badge ${r.ok ? 'badge-green' : 'badge-hot'}`}>{r.ok ? 'OK' : 'Error'}</span>
                  <span className="grow">{fmtDateTime(r.startedAt, 'UTC')} UTC{r.finishedAt ? ` · ${r.finishedAt.getTime() - r.startedAt.getTime()} ms` : ' · running'}<br />
                    <span className="muted">{r.error ?? (res ? Object.entries(res).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(' · ') || 'nothing to do' : '')}</span></span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
      {h.recentFailures.length > 0 && (
        <section className="stack" aria-labelledby="fails">
          <h2 id="fails" style={{ fontSize: 18 }}>Latest business failures</h2>
          <div className="table-wrap"><table className="table"><thead><tr><th>Business</th><th>Channel</th><th>Error</th><th>When (UTC)</th></tr></thead><tbody>
            {h.recentFailures.map(({ m, business }) => <tr key={m.id}><td>{business}</td><td>{m.channel}</td><td className="small">{m.error}</td><td className="small">{fmtDateTime(m.updatedAt, 'UTC')}</td></tr>)}
          </tbody></table></div>
        </section>
      )}
    </>
  );
}
