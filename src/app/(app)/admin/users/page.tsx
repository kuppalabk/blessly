import Link from 'next/link';
import { getDb } from '@/server/db';
import { listUsers } from '@/server/services/admin';
import { fmtDateTime } from '@/components/business/ui';

export const dynamic = 'force-dynamic';
const FILTERS = [['', 'All'], ['suspended', 'Suspended'], ['business', 'Business owners'], ['admins', 'Admins']] as const;

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string; page?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.page) || 0);
  const { users, total } = await listUsers(getDb(), { q: sp.q, filter: sp.filter, offset: page * 50 });
  const qs = (p: Record<string, string>) => `?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.filter ? { filter: sp.filter } : {}), ...p })}`;
  return (
    <section className="stack">
      <form className="row" style={{ gap: 8 }} role="search">
        {sp.filter && <input type="hidden" name="filter" value={sp.filter} />}
        <label className="grow"><span className="sr-only">Search users</span><input className="input" type="search" name="q" defaultValue={sp.q} placeholder="Search by name or email" /></label>
        <button className="btn btn-ghost">Search</button>
      </form>
      <div className="row-wrap" role="group" aria-label="Filter users">
        {FILTERS.map(([f, label]) => <Link key={f} href={`?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(f ? { filter: f } : {}) })}`} className="chip" aria-pressed={(sp.filter ?? '') === f} style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>{label}</Link>)}
      </div>
      <p className="muted small">{total.toLocaleString()} user{total === 1 ? '' : 's'}</p>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>User</th><th>Status</th><th>Joined</th><th>Last seen</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td><Link href={`/admin/users/${u.id}`}><b>{u.name}</b></Link><br /><span className="muted small">{u.email}</span></td>
                <td>{u.suspendedAt ? <span className="badge badge-hot">Suspended</span> : u.role === 'admin' ? <span className="badge badge-purple">Admin</span> : <span className="badge">Active</span>}</td>
                <td className="small" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(u.createdAt, 'UTC')}</td>
                <td className="small" style={{ whiteSpace: 'nowrap' }}>{u.lastSeenAt ? fmtDateTime(u.lastSeenAt, 'UTC') : '—'}</td>
              </tr>
            ))}
            {users.length === 0 && <tr><td colSpan={4} className="muted">No users match.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="row between">
        {page > 0 ? <Link className="btn btn-ghost btn-sm" href={qs({ page: String(page - 1) })}>Previous</Link> : <span />}
        {(page + 1) * 50 < total && <Link className="btn btn-ghost btn-sm" href={qs({ page: String(page + 1) })}>Next</Link>}
      </div>
      <p className="muted small">Times in UTC.</p>
    </section>
  );
}
