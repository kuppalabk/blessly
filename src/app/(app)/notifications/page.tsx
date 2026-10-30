import Link from 'next/link';
import { getDb } from '@/server/db';
import { pageUser } from '@/server/http';
import { listNotifications } from '@/server/services/home';
import { MarkRead } from './MarkRead';
import { getT } from '@/server/i18n';

export async function generateMetadata() {
  const { t, intl } = await getT();
  return { title: t("Alerts") };
}

export default async function Notifications() {
  const { t, intl } = await getT();
  const user = await pageUser();
  const list = await listNotifications(getDb(), user.id, 50);
  const unread = list.some((n) => !n.readAt);
  return (
    <div className="stack-lg" style={{ maxWidth: 720 }}>
      <h1>{t("Alerts")}</h1>
      {unread && <MarkRead />}
      <ul className="list">
        {list.length === 0 && <li className="muted">{t("No alerts yet. Reminders appear here before each occasion.")}</li>}
        {list.map((n) => (
          <li key={n.id}>
            <Link className="item" href={n.link ?? '/home'} style={!n.readAt ? { borderColor: 'var(--primary)', background: '#F8F6FF' } : undefined}>
              <span className="grow"><b>{n.title}</b><br /><span className="muted small">{n.body} · {n.createdAt.toLocaleString(intl, { dateStyle: 'medium', timeStyle: 'short', timeZone: user.timezone })}</span></span>
              {!n.readAt && <span className="badge badge-purple">{t("New")}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
