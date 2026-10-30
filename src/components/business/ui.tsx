import { NavLink } from '@/components/NavLink';
import { getT } from '@/server/i18n';
import { msg } from '@/lib/i18n/ui';

export const STATUS_LABEL: Record<string, string> = { queued: msg('Queued'), sent: msg('Sent'), delivered: msg('Delivered'), read: msg('Read'), failed: msg('Failed'), skipped: msg('Not sent') };
const STATUS_CLASS: Record<string, string> = { delivered: 'badge-green', read: 'badge-green', sent: 'badge-purple', failed: 'badge-hot', queued: '', skipped: '' };

export async function StatusBadge({ status }: { status: string }) {
  const { t } = await getT();
  return <span className={`badge ${STATUS_CLASS[status] ?? ''}`}>{t(STATUS_LABEL[status] ?? status)}</span>;
}

export const SOURCE_LABEL: Record<string, string> = { birthday: msg('Birthday'), anniversary: msg('Anniversary'), campaign: msg('Campaign') };

const TABS = [
  [msg('/business'), msg('Overview')], [msg('/business/customers'), msg('Customers')], [msg('/business/automations'), msg('Automations')],
  [msg('/business/campaigns'), msg('Campaigns')], [msg('/business/messages'), msg('Messages')], [msg('/business/settings'), msg('Settings')]
] as const;

export async function BizTabs() {
  const { t, intl } = await getT();
  return (
    <nav aria-label={t("Business")} className="biz-tabs">
      {TABS.map(([href, label]) => <NavLink key={href} href={href} className="biz-tab" exact={href === '/business'}>{t(label)}</NavLink>)}
    </nav>
  );
}

export function fmtDateTime(d: Date | string, tz: string, intl = 'en-GB') {
  return new Intl.DateTimeFormat(intl, { timeZone: tz, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(d));
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dm = (m: number | null, d: number | null, intl = 'en-GB') => (m && d ? new Intl.DateTimeFormat(intl, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, m - 1, d))) : null);

const ADMIN_TABS = [['/admin', 'Overview'], ['/admin/users', 'Users'], ['/admin/businesses', 'Businesses'], ['/admin/plans', 'Plans'], ['/admin/content', 'Content'], ['/admin/system', 'System'], ['/admin/integrations', 'Integrations'], ['/admin/promotions', 'Promotions'], ['/admin/audit', 'Audit log']] as const;

export async function AdminTabs({ money = false }: { money?: boolean }) {
  const { t, intl } = await getT();
  return (
    <nav aria-label={t("Admin")} className="biz-tabs">
      {[...ADMIN_TABS.slice(0, 5), ...(money ? [['/admin/money', 'Money'] as const] : []), ...ADMIN_TABS.slice(5)].map(([href, label]) => <NavLink key={href} href={href} className="biz-tab" exact={href === '/admin'}>{label}</NavLink>)}
    </nav>
  );
}
