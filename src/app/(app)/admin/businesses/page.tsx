import { getDb } from '@/server/db';
import { listBusinesses } from '@/server/services/admin';
import { BusinessControls } from './BusinessControls';

export const dynamic = 'force-dynamic';

export default async function AdminBusinesses({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const list = await listBusinesses(getDb(), { q: sp.q });
  return (
    <section className="stack">
      <form className="row" style={{ gap: 8 }} role="search">
        <label className="grow"><span className="sr-only">Search businesses</span><input className="input" type="search" name="q" defaultValue={sp.q} placeholder="Business name or owner email" /></label>
        <button className="btn btn-ghost">Search</button>
      </form>
      {list.length === 0 && <p className="muted">No businesses{sp.q ? ' match' : ' yet'}.</p>}
      <ul className="list">
        {list.map((b) => (
          <li key={b.id} className="card-box" style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }}>
            <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
              <div><b>{b.name}</b><br /><span className="muted small">{b.ownerName} · {b.ownerEmail} · {b.country}</span></div>
              <div className="row-wrap">
                {b.pausedAt ? <span className="badge badge-hot">Paused</span> : <span className="badge badge-green">Sending</span>}
                <span className="badge">{b.waConnected ? `WhatsApp ${b.waDisplayNumber ?? ''}` : 'Email only'}</span>
              </div>
            </div>
            {b.pausedReason && <p className="small muted">Paused: {b.pausedReason}</p>}
            <div className="two-col" style={{ gap: 12 }}>
              <div className="small stack" style={{ gap: 4 }}>
                <span>{b.customers.toLocaleString()} customers</span>
                <span>{b.sent.toLocaleString()} of {b.quota.toLocaleString()} messages this month ({b.quotaSource === 'custom' ? 'custom allowance' : b.quotaSource === 'plan' ? 'Business plan' : b.quotaSource === 'trial' ? 'free trial' : 'no plan'}){b.failed ? ` · ${b.failed} failed` : ''}</span>
                <div className="progress"><span style={{ width: `${Math.min(100, Math.round((b.sent / Math.max(1, b.quota)) * 100))}%` }} /></div>
              </div>
              <BusinessControls id={b.id} name={b.name} quota={b.customQuota} paused={!!b.pausedAt} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
