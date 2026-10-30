'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useT } from '@/components/I18n';

type Row = { id: string; name: string; relationship: string; next: string; days: number | null; sharedBy?: string | null; shared?: boolean };

export function PeopleSearch({ rows }: { rows: Row[] }) {
  const { t } = useT();
  const [q, setQ] = useState('');
  const shown = rows.filter((r) => (r.name + ' ' + r.relationship).toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="stack">
      <label className="field"><span className="sr-only">{t("Search people")}</span>
        <input className="input" type="search" placeholder={t("Search {length} people", { length: rows.length })} value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <ul className="list">
        {shown.map((r) => (
          <li key={r.id}>
            <Link className="item" href={`/people/${r.id}`}>
              <span className="avatar">{r.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()}</span>
              <span className="grow"><b>{r.name}</b><br /><span className="muted small">{r.relationship} · {r.next}</span>{r.shared && <><br /><span className="small" style={{ color: 'var(--green)', fontWeight: 700 }}>{r.sharedBy ? t("Shared by {sharedBy}", { sharedBy: r.sharedBy }) : t("Shared with family")}</span></>}</span>
              {r.days !== null && <span className={`badge ${r.days <= 1 ? 'badge-hot' : ''}`}>{r.days === 0 ? t("Today") : r.days === 1 ? t("Tomorrow") : t("{days} days", { days: r.days })}</span>}
            </Link>
          </li>
        ))}
        {!shown.length && <li className="muted">{t("No one matches “{q}”.", { q })}</li>}
      </ul>
    </div>
  );
}
