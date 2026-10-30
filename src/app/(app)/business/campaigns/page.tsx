import { redirect } from 'next/navigation';
import { getDb } from '@/server/db';
import { pageUser } from '@/server/http';
import { getMyBusiness, listCampaigns, listTemplates, publicBusiness, usableTemplate } from '@/server/services/business';
import { fmtDateTime } from '@/components/business/ui';
import { CampaignForm, CancelCampaign } from './CampaignForm';
import { getT } from '@/server/i18n';
import { msg } from '@/lib/i18n/ui';

export async function generateMetadata() {
  const { t, intl } = await getT();
  return { title: t("Campaigns") };
}
const STATUS = { scheduled: msg('Scheduled'), sending: msg('Sending'), done: msg('Sent'), cancelled: msg('Cancelled') } as const;

export default async function Campaigns() {
  const { t: tr, intl } = await getT();
  const user = await pageUser();
  const raw = await getMyBusiness(getDb(), user.id);
  if (!raw) redirect('/business');
  const b = publicBusiness(raw);
  const list = await listCampaigns(getDb(), b.id);
  const templates = (await listTemplates(getDb(), b.id)).filter((t) => t.status !== 'DELETED').map((t) => ({ id: t.id, name: t.name, language: t.language, body: t.body, status: t.status, usable: usableTemplate(t) }));
  return (
    <div className="two-col">
      <CampaignForm templates={templates} waConnected={b.waConnected} business={b.name} />
      <section className="stack" aria-labelledby="camps">
        <h2 id="camps">{tr("Your campaigns")}</h2>
        {list.length === 0 && <p className="muted">{tr("No campaigns yet. Schedule festival greetings or an offer for a group of customers.")}</p>}
        <ul className="list">
          {list.map((c) => {
            const delivered = (c.stats.delivered ?? 0) + (c.stats.read ?? 0);
            const sent = delivered + (c.stats.sent ?? 0);
            return (
              <li key={c.id} className="card-box stack" style={{ gap: 6 }}>
                <div className="row between"><b>{c.name}</b><span className={`badge ${c.status === 'done' ? 'badge-green' : c.status === 'scheduled' ? 'badge-purple' : ''}`}>{tr(STATUS[c.status])}</span></div>
                <p className="muted small">{fmtDateTime(c.sendAt, b.timezone, intl)} · {c.tag ? tr("tag “{tag}”", { tag: c.tag }) : tr("all customers")} · {tr("{n} people", { n: c.audience.toLocaleString() })}</p>
                {c.status === 'done' && <p className="small">{tr("{sent} sent · {delivered} delivered · {read} read · {failed} not sent", { sent, delivered, read: c.stats.read ?? 0, failed: (c.stats.failed ?? 0) + (c.stats.skipped ?? 0) })}</p>}
                {c.status === 'scheduled' && <div><CancelCampaign id={c.id} /></div>}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
