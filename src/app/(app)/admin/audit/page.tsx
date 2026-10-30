import { getDb } from '@/server/db';
import { auditLog } from '@/server/services/admin';
import { fmtDateTime } from '@/components/business/ui';

export const dynamic = 'force-dynamic';

export default async function AdminAudit() {
  const rows = await auditLog(getDb());
  return (
    <section className="stack">
      <p className="muted small">Every admin action, newest first. Entries can’t be edited or removed from the app.</p>
      {rows.length === 0 ? <p className="muted">No admin actions yet.</p> : (
        <div className="table-wrap"><table className="table"><thead><tr><th>When (UTC)</th><th>Admin</th><th>Action</th><th>Target</th><th>Details</th></tr></thead><tbody>
          {rows.map((r) => <tr key={r.id}><td className="small" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(r.createdAt, 'UTC')}</td><td className="small">{r.adminEmail}</td><td><span className="code">{r.action}</span></td><td className="small">{r.targetLabel ?? r.targetId}</td><td className="small">{r.details}</td></tr>)}
        </tbody></table></div>
      )}
    </section>
  );
}
