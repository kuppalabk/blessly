import { notFound, redirect } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { pageUser } from '@/server/http';
import { AppError } from '@/server/errors';
import { bizMessages } from '@/server/schema';
import { getCustomer, getMyBusiness } from '@/server/services/business';
import { fmtDateTime, SOURCE_LABEL, StatusBadge } from '@/components/business/ui';
import { CustomerForm } from '../CustomerForm';
import { DeleteCustomer } from './DeleteCustomer';
import { getT } from '@/server/i18n';

export async function generateMetadata() {
  const { t, intl } = await getT();
  return { title: t("Customer") };
}

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { t, intl } = await getT();
  const user = await pageUser();
  const b = await getMyBusiness(getDb(), user.id);
  if (!b) redirect('/business');
  const c = await getCustomer(getDb(), b.id, (await params).id).catch((e) => { if (e instanceof AppError && e.status === 404) notFound(); throw e; });
  const history = await getDb().select().from(bizMessages).where(eq(bizMessages.customerId, c.id)).orderBy(desc(bizMessages.createdAt)).limit(20);
  const s = (n: number | null) => (n == null ? '' : String(n));
  return (
    <div className="two-col">
      <section className="stack">
        <h2>{c.name}</h2>
        {(c.waOptOutAt || c.emailOptOutAt) && <p className="notice">{t("Unsubscribed from")}{' '}{[c.waOptOutAt && 'WhatsApp', c.emailOptOutAt && 'email'].filter(Boolean).join(' and ')}{t(". Blessly won’t message them there.")}</p>}
        <CustomerForm id={c.id} consentSource={c.consentSource ? `${c.consentSource}, ${c.consentAt?.toISOString().slice(0, 10)}` : null}
          initial={{ name: c.name, phone: c.phone ? `+${c.phone}` : '', email: c.email ?? '', language: c.language, birthdayMonth: s(c.birthdayMonth), birthdayDay: s(c.birthdayDay), anniversaryMonth: s(c.anniversaryMonth), anniversaryDay: s(c.anniversaryDay), tags: c.tags.split(',').filter(Boolean).join(', '), consent: !!c.consentAt }} />
        <DeleteCustomer id={c.id} name={c.name} />
      </section>
      <section className="stack" aria-labelledby="hist">
        <h2 id="hist">{t("Messages")}</h2>
        {history.length === 0 && <p className="muted">{t("Nothing sent to {v} yet.", { v: c.name.split(' ')[0] })}</p>}
        <ul className="list">
          {history.map((m) => (
            <li key={m.id} className="card-box stack" style={{ gap: 8 }}>
              <div className="row between"><span className="small"><b>{t(SOURCE_LABEL[m.source])}</b> · {m.channel === 'whatsapp' ? t("WhatsApp") : t("Email")} · {fmtDateTime(m.createdAt, b.timezone, intl)}</span><StatusBadge status={m.status} /></div>
              {m.preview && <p className="wa-bubble" style={m.channel === 'email' ? { background: 'var(--soft)' } : undefined}>{m.preview}</p>}
              {m.error && <p className="muted small">{m.error}</p>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
