import Link from 'next/link';
import { getDb } from '@/server/db';
import { platformStats } from '@/server/services/admin';

export const dynamic = 'force-dynamic';

export default async function AdminHome() {
  const s = await platformStats(getDb());
  const max = Math.max(1, ...s.signups.map((d) => d.n));
  const biz = (ch: string, st: string[]) => s.biz.filter((b) => b.channel === ch && st.includes(b.status)).reduce((a, b) => a + b.n, 0);
  return (
    <>
      <section className="stats" aria-label="Users">
        <div className="stat"><span className="muted small">Users</span><b>{s.usersTotal.toLocaleString()}</b><span className="muted small">+{s.new7} this week · +{s.new30} in 30 days</span></div>
        <div className="stat"><span className="muted small">Active (7 days)</span><b>{s.active7.toLocaleString()}</b><span className="muted small">{s.active30} in 30 days</span></div>
        <div className="stat"><span className="muted small">Family circles</span><b>{s.familiesTotal.toLocaleString()}</b><span className="muted small">{s.pushDevices} devices with push</span></div>
        <div className="stat"><span className="muted small">Businesses</span><b>{s.businessesTotal.toLocaleString()}</b><span className="muted small">{s.waConnected} on WhatsApp</span></div>
      </section>
      <div className="two-col">
        <section className="card-box stack" aria-labelledby="signups">
          <h2 id="signups" style={{ fontSize: 18 }}>Sign-ups, last 14 days</h2>
          <div role="img" aria-label={`Sign-ups per day: ${s.signups.map((d) => `${d.day.slice(5)} ${d.n}`).join(', ')}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(14, 1fr)', gap: 4, alignItems: 'end', height: 140 }}>
            {s.signups.map((d) => (
              <div key={d.day} title={`${d.day}: ${d.n}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
                <span className="small" style={{ fontSize: 11, color: 'var(--muted)' }}>{d.n || ''}</span>
                <span style={{ width: '100%', height: `${Math.max(2, (d.n / max) * 100)}px`, background: d.n ? 'var(--primary)' : 'var(--line)', borderRadius: 4 }} />
              </div>
            ))}
          </div>
          <div className="row between muted small"><span>{s.signups[0].day.slice(5)}</span><span>today</span></div>
        </section>
        <section className="card-box stack" aria-labelledby="msgs">
          <h2 id="msgs" style={{ fontSize: 18 }}>Business messages this month</h2>
          <table className="table">
            <thead><tr><th></th><th>Sent</th><th>Delivered/read</th><th>Failed</th></tr></thead>
            <tbody>
              {(['whatsapp', 'email'] as const).map((ch) => (
                <tr key={ch}><td><b>{ch === 'whatsapp' ? 'WhatsApp' : 'Email'}</b></td><td>{biz(ch, ['sent', 'delivered', 'read'])}</td><td>{biz(ch, ['delivered', 'read'])}</td><td>{biz(ch, ['failed'])}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">{s.wishesTotal.toLocaleString()} wishes written · {s.pagesTotal.toLocaleString()} wish pages shared</p>
          {s.suspended > 0 && <Link href="/admin/users?filter=suspended" className="small">{s.suspended} suspended account{s.suspended === 1 ? '' : 's'}</Link>}
        </section>
      </div>
    </>
  );
}
