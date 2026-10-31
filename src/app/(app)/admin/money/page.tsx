import { notFound } from 'next/navigation';
import { getDb } from '@/server/db';
import { adminMoneyOverview, moneyEnabled } from '@/server/services/money';
import { reviewQueue } from '@/server/services/marketplace';
import { AdminMoneyAction } from '@/components/money/MoneyUI';
import { formatMoney } from '@/lib/money';

export const metadata = { title: 'Money and partners' };

export default async function AdminMoney() {
  if (!moneyEnabled()) notFound();
  const q = await reviewQueue(getDb());
  const o = await adminMoneyOverview(getDb());
  const pending = q.partners.filter((p) => p.status === 'pending');
  return (
    <div className="stack-lg">
      <p className="notice">Test mode — no real money moves. Platform balance: {Object.entries(o.platform).map(([c, v]) => formatMoney(v, c)).join(' · ') || '—'}</p>
      <section className="stack"><h2>Partner applications ({pending.length})</h2>
        {pending.length === 0 && <p className="muted small">Nothing waiting.</p>}
        {pending.map((p) => (
          <div key={p.id} className="card-box stack" style={{ gap: 6 }}>
            <b>{p.name} · {p.kind} · {p.country}</b>
            <span className="small">{p.email}{p.website ? ` · ${p.website}` : ''}{p.regNumber ? ` · reg. ${p.regNumber}` : ''}</span>
            {p.description && <span className="small">{p.description}</span>}
            <div className="row-wrap"><AdminMoneyAction label="Approve" body={{ action: 'review', what: 'partner', id: p.id, decision: 'approved' }} /><AdminMoneyAction danger label="Reject" body={{ action: 'review', what: 'partner', id: p.id, decision: 'rejected' }} /></div>
          </div>
        ))}
      </section>
      <section className="stack"><h2>Products to review ({q.products.length})</h2>
        {q.products.map((p) => (
          <div key={p.id} className="card-box row" style={{ gap: 10, flexWrap: 'wrap' }}>
            {p.imageUrl && <img src={p.imageUrl} alt="" width={56} height={56} style={{ borderRadius: 8, objectFit: 'cover' }} />}
            <span className="grow"><b>{p.title}</b> · {p.priceText} · {p.seller}<br /><span className="small">{p.description}</span></span>
            <AdminMoneyAction label="Approve" body={{ action: 'review', what: 'product', id: p.id, decision: 'approved' }} /><AdminMoneyAction danger label="Reject" body={{ action: 'review', what: 'product', id: p.id, decision: 'rejected' }} />
          </div>
        ))}
      </section>
      <section className="stack"><h2>Card designs to review ({q.designs.length})</h2>
        <div className="grid-cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
          {q.designs.map((d) => (
            <div key={d.id} className="card-box stack" style={{ gap: 6 }}>
              <img src={d.imageUrl} alt={d.title} style={{ width: '100%', borderRadius: 8 }} />
              <span className="small"><b>{d.title}</b> · {d.occasion} · {d.by}</span>
              <div className="row-wrap"><AdminMoneyAction label="Approve" body={{ action: 'review', what: 'design', id: d.id, decision: 'approved' }} /><AdminMoneyAction danger label="Reject" body={{ action: 'review', what: 'design', id: d.id, decision: 'rejected' }} /></div>
            </div>
          ))}
        </div>
      </section>
      <section className="stack"><h2>Payout requests ({o.pendingPayouts.length})</h2>
        {o.pendingPayouts.map((p) => (
          <div key={p.id} className="card-box row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <span className="grow">{formatMoney(p.amount, p.currency)} · {p.account} · {p.createdAt.toLocaleDateString('en-GB')}</span>
            <AdminMoneyAction label="Mark paid" body={{ action: 'payout', id: p.id, approve: true, reference: `TEST-${p.id.slice(0, 6)}` }} />
            <AdminMoneyAction danger label="Reject" body={{ action: 'payout', id: p.id, approve: false }} />
          </div>
        ))}
      </section>
      <section className="stack"><h2>Recent payments</h2>
        <div className="table-wrap"><table className="table"><thead><tr><th>When</th><th>What</th><th>Amount</th><th>Status</th><th /></tr></thead><tbody>
          {o.recent.map((p) => <tr key={p.id}><td className="small">{p.createdAt.toLocaleString('en-GB')}</td><td className="small">{p.description}</td><td>{formatMoney(p.amount, p.currency)}</td><td>{p.status}</td><td>{p.status === 'paid' && <AdminMoneyAction danger label="Refund" confirmText="Refund this payment?" body={{ action: 'refund', id: p.id }} />}</td></tr>)}
        </tbody></table></div>
      </section>
      <section className="stack"><h2>All partners</h2>
        <ul className="list small">{q.partners.map((p) => <li key={p.id} className="item"><span className="grow">{p.name} · {p.kind} · {p.status}</span>{p.status === 'approved' && <AdminMoneyAction danger label="Suspend" confirmText={`Suspend ${p.name}?`} body={{ action: 'review', what: 'partner', id: p.id, decision: 'suspended' }} />}{p.status === 'suspended' && <AdminMoneyAction label="Restore" body={{ action: 'review', what: 'partner', id: p.id, decision: 'approved' }} />}</li>)}</ul>
      </section>
    </div>
  );
}
