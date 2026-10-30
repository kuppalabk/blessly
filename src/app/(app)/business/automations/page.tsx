import { redirect } from 'next/navigation';
import { getDb } from '@/server/db';
import { pageUser } from '@/server/http';
import { getMyBusiness, listAutomations, listTemplates, publicBusiness, usableTemplate } from '@/server/services/business';
import { AutomationForm } from './AutomationForm';
import { getT } from '@/server/i18n';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("Automations") };
}

export default async function Automations() {
  const { t: tr } = await getT();
  const user = await pageUser();
  const raw = await getMyBusiness(getDb(), user.id);
  if (!raw) redirect('/business');
  const b = publicBusiness(raw);
  const autos = await listAutomations(getDb(), b.id);
  const templates = (await listTemplates(getDb(), b.id)).filter((t) => t.status !== 'DELETED').map((t) => ({ id: t.id, name: t.name, language: t.language, body: t.body, status: t.status, usable: usableTemplate(t) }));
  return (
    <section className="stack">
      <p className="muted">{tr("Wishes go out automatically on the day, in {timezone} time, to customers who agreed to messages. Each customer gets one message per occasion.", { timezone: b.timezone })}</p>
      <div className="two-col">
        {autos.map((a) => <AutomationForm key={a.id} waConnected={b.waConnected} business={b.name} templates={templates}
          initial={{ kind: a.kind, enabled: a.enabled, channel: a.channel, templateId: a.templateId, emailSubject: a.emailSubject, emailBody: a.emailBody, sendHour: a.sendHour }} />)}
      </div>
      <p className="muted small">{tr("WhatsApp only lets businesses start a conversation with a template Meta has approved. Create one in WhatsApp Manager (for example “Happy birthday")}{' '}{'{{1}}'}{tr("! Enjoy a treat on us at")}{' '}{'{{2}}'}{tr("”), then press “Refresh templates” in Settings.")}{' '}{'{{1}}'}{' '}{tr("is filled with the customer’s first name and")}{' '}{'{{2}}'}{' '}{tr("with your business name.")}</p>
    </section>
  );
}
