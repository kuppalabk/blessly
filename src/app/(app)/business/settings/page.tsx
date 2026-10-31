import { redirect } from 'next/navigation';
import { getDb } from '@/server/db';
import { pageUser } from '@/server/http';
import { getMyBusiness, listTeam, listTemplates, publicBusiness, usableTemplate } from '@/server/services/business';
import { Team } from './Team';
import { businessAllowance } from '@/server/services/billing';
import Link from 'next/link';
import { BusinessDetails } from './BusinessDetails';
import { ConnectWhatsApp } from './ConnectWhatsApp';
import { getT } from '@/server/i18n';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("Business settings") };
}

export default async function BizSettings() {
  const { t: tr } = await getT();
  const user = await pageUser();
  const raw = await getMyBusiness(getDb(), user.id);
  if (!raw) redirect('/business');
  const b = publicBusiness(raw);
  const templates = await listTemplates(getDb(), b.id);
  const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
  const allowance = await businessAllowance(getDb(), raw);
  const isOwner = raw.ownerId === user.id;
  const team = await listTeam(getDb(), raw);
  return (
    <div className="two-col">
      <div className="stack-lg">
        <section className="card-box stack" aria-labelledby="wa-h">
          <h2 id="wa-h" style={{ fontSize: 19 }}>{tr("WhatsApp Business")}</h2>
          {b.waConnected ? (
            <>
              <p><b>{b.waVerifiedName || b.name}</b> · {b.waDisplayNumber}</p>
              <p className="muted small">{tr("Messages are sent from this number through WhatsApp’s official Business Platform. Meta charges your WhatsApp account per delivered message (marketing rate).")}</p>
            </>
          ) : (
            <ol className="small stack" style={{ margin: 0, paddingLeft: 18, gap: 6 }}>
              <li>{tr("In Meta Business Suite, set up WhatsApp Manager with a phone number that isn’t used in the WhatsApp app, and add a payment method.")}</li>
              <li>{tr("In your Meta app, open WhatsApp → API setup and copy the")}{' '}<b>{tr("Phone number ID")}</b> {' '}{tr("and")}{' '}<b>{tr("WhatsApp Business Account ID")}</b>.</li>
              <li>{tr("Create a")}{' '}<b>{tr("System User")}</b> {' '}{tr("with the whatsapp_business_messaging and whatsapp_business_management permissions and generate a permanent token.")}</li>
              <li>{tr("Create message templates (e.g. a birthday wish) and wait for approval.")}</li>
            </ol>
          )}
          {isOwner ? <ConnectWhatsApp connected={b.waConnected} /> : <p className="muted small">{tr("Only the owner can change the WhatsApp connection.")}</p>}
        </section>
        {b.waConnected && (
          <section className="card-box stack" aria-labelledby="tpl-h">
            <h2 id="tpl-h" style={{ fontSize: 19 }}>{tr("Templates")}</h2>
            {templates.length === 0 && <p className="muted small">{tr("No templates yet. Create them in WhatsApp Manager, then refresh.")}</p>}
            <ul className="list">
              {templates.map((t) => (
                <li key={t.id} className="stack" style={{ gap: 4, borderBottom: '1px solid var(--line)', paddingBottom: 8 }}>
                  <div className="row between"><span><b>{t.name}</b> <span className="muted small">{t.language} · {t.category.toLowerCase()}</span></span>
                    <span className={`badge ${usableTemplate(t) ? 'badge-green' : ''}`}>{t.status === 'APPROVED' ? (usableTemplate(t) ? tr("Approved") : tr("Too many variables")) : t.status.toLowerCase()}</span></div>
                  {t.body && <p className="muted small">{t.body}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <div className="stack-lg">
        {isOwner && <BusinessDetails initial={{ name: b.name, timezone: b.timezone, country: b.country }} />}
        <Team owner={team.owner} staff={team.staff} seats={team.seats} isOwner={isOwner} me={user.id}
          invites={isOwner ? team.invites.map((i) => ({ id: i.id, email: i.email, token: i.token, expiresAt: i.expiresAt.toISOString() })) : []} />
        <section className="card-box stack" aria-labelledby="hook-h">
          <h2 id="hook-h" style={{ fontSize: 19 }}>{tr("Delivery updates")}</h2>
          <p className="small">{tr("To see delivered and read ticks, and to handle customers who reply STOP, the Blessly Meta app must receive your number’s webhooks. Callback URL:")}</p>
          <p className="code">{tr("{appUrl}/api/webhooks/whatsapp", { appUrl })}</p>
          <p className="muted small">{tr("The Blessly team sets the verify token and app secret on the server. Customers who reply STOP are unsubscribed from WhatsApp automatically; START subscribes them again.")}</p>
        </section>
        <section className="card-box stack">
          <h2 style={{ fontSize: 19 }}>{tr("Plan")}</h2>
          <p className="small">{allowance.source === 'plan' ? tr("Business plan") : allowance.source === 'trial' ? tr("Free trial until {v}", { v: raw.trialEndsAt?.toISOString().slice(0, 10) }) : allowance.source === 'custom' ? tr("Custom plan") : tr("No plan — messages are paused")} · {allowance.quota.toLocaleString()}{' '}{tr("messages a month (WhatsApp and email). WhatsApp’s own per-message charges are billed by Meta to your WhatsApp account.")}</p>
          {allowance.source !== 'plan' && allowance.source !== 'custom' && <Link className="btn" href="/plans">{tr("Choose the Business plan")}</Link>}
        </section>
      </div>
    </div>
  );
}
