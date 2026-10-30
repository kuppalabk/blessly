'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/components/api';

type Plan = { id: string; name: string; inrMonthly: number; inrYearly: number; usdMonthly: number; usdYearly: number; maxFamilyMembers: number; maxAlbums: number; maxPhotosPerAlbum: number; businessMessages: number; businessSeats: number };
const money = (n: number) => String(n / 100);

export function PlanEditor({ plan }: { plan: Plan }) {
  const router = useRouter();
  const [v, setV] = useState({ inrMonthly: money(plan.inrMonthly), inrYearly: money(plan.inrYearly), usdMonthly: money(plan.usdMonthly), usdYearly: money(plan.usdYearly), maxFamilyMembers: String(plan.maxFamilyMembers), maxAlbums: String(plan.maxAlbums), maxPhotosPerAlbum: String(plan.maxPhotosPerAlbum), businessMessages: String(plan.businessMessages), businessSeats: String(plan.businessSeats) });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const free = plan.id === 'free';
  const field = (k: keyof typeof v, label: string, disabled = false) => (
    <label className="field">{label}<input className="input" inputMode="decimal" aria-label={`${plan.name} ${label}`} value={v[k]} disabled={disabled} onChange={(e) => setV({ ...v, [k]: e.target.value.replace(/[^\d.]/g, '') })} /></label>
  );
  return (
    <form className="card-box stack" aria-label={`${plan.name} plan`} onSubmit={async (e) => {
      e.preventDefault(); setMsg(null);
      const cents = (x: string) => Math.round(Number(x || 0) * 100);
      try {
        await api(`/api/admin/plans/${plan.id}`, { method: 'PUT', body: { inrMonthly: cents(v.inrMonthly), inrYearly: cents(v.inrYearly), usdMonthly: cents(v.usdMonthly), usdYearly: cents(v.usdYearly), maxFamilyMembers: Number(v.maxFamilyMembers), maxAlbums: Number(v.maxAlbums), maxPhotosPerAlbum: Number(v.maxPhotosPerAlbum), businessMessages: Number(v.businessMessages), businessSeats: Number(v.businessSeats) } });
        setMsg({ ok: true, text: 'Saved. New prices apply to new sign-ups; current subscribers keep their price.' }); router.refresh();
      } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : 'Could not save' }); }
    }}>
      <h2 style={{ fontSize: 19 }}>{plan.name}</h2>
      <div className="two-col" style={{ gap: 10 }}>{field('inrMonthly', '₹ a month', free)}{field('inrYearly', '₹ a year', free)}</div>
      <div className="two-col" style={{ gap: 10 }}>{field('usdMonthly', '$ a month', free)}{field('usdYearly', '$ a year', free)}</div>
      <div className="two-col" style={{ gap: 10 }}>{field('maxFamilyMembers', 'Family circle size')}{field('maxAlbums', 'Albums (100+ = unlimited)')}</div>
      <div className="two-col" style={{ gap: 10 }}>{field('maxPhotosPerAlbum', 'Photos per album')}{field('businessMessages', 'Business messages a month')}</div>
      {field('businessSeats', 'Business team logins')}
      {msg && <p className={msg.ok ? 'small' : 'error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
      <button className="btn">Save {plan.name}</button>
    </form>
  );
}
