import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { NavLink } from './NavLink';
import { getT } from '@/server/i18n';
import { msg } from '@/lib/i18n/ui';

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: '/home', label: msg('Home'), icon: 'home' },
  { href: '/people', label: msg('People'), icon: 'people' },
  { href: '/create', label: msg('Create'), icon: 'plus' },
  { href: '/family', label: msg('Family'), icon: 'family' },
  { href: '/notifications', label: msg('Alerts'), icon: 'bell' }
];

export async function AppShell({ children, unread = 0, isAdmin = false, banner, money = false }: { children: ReactNode; unread?: number; isAdmin?: boolean; banner?: ReactNode; money?: boolean }) {
  const { t } = await getT();
  return (
    <div className="shell">
      <aside className="side">
        <Link href="/home" className="brand"><span className="brand-mark"><Icon name="sparkle" size={18} strokeWidth={2} /></span>{t("Blessly")}</Link>
        <nav aria-label={t("Main")} className="stack" style={{ gap: 2 }}>
          {[...NAV.slice(0, 4), { href: '/calendar', label: msg('Calendar'), icon: 'calendar' as IconName }, NAV[4], { href: '/celebrations', label: msg('Celebrations'), icon: 'calendar' as IconName }, { href: '/wishlists', label: msg('Wishlists'), icon: 'sparkle' as IconName }, ...(money ? [{ href: '/money', label: msg('Gifts & payments'), icon: 'shop' as IconName }] : []), { href: '/albums', label: msg('Albums'), icon: 'cards' as IconName }, { href: '/cards', label: msg('Card library'), icon: 'cards' as IconName }, { href: '/designs', label: msg('My cards'), icon: 'sparkle' as IconName }, { href: '/business', label: msg('Business'), icon: 'shop' as IconName }, { href: '/plans', label: msg('Plans'), icon: 'sparkle' as IconName }, { href: '/settings', label: msg('Settings'), icon: 'settings' as IconName }, ...(isAdmin ? [{ href: '/admin', label: msg('Platform admin'), icon: 'shield' as IconName }] : [])].map((n) => (
            <NavLink key={n.href} href={n.href} className="side-link">
              <Icon name={n.icon} size={20} />{t(n.label)}{n.href === '/notifications' && unread > 0 ? <span className="badge badge-hot" style={{ marginInlineStart: 'auto' }}>{unread}</span> : null}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="main">{banner}{children}</main>
      <nav aria-label={t("Main")} className="tabbar">
        {NAV.map((n) => n.href === '/create' ? (
          <NavLink key={n.href} href={n.href} className="tab tab-create" ariaLabel={t("Create a wish")}><span className="fab"><Icon name="plus" size={26} strokeWidth={2} /></span></NavLink>
        ) : (
          <NavLink key={n.href} href={n.href} className="tab">
            <span style={{ position: 'relative' }}><Icon name={n.icon} />{n.href === '/notifications' && unread > 0 ? <span aria-label={t("{unread} unread", { unread })} style={{ position: 'absolute', top: -2, right: -4, width: 9, height: 9, borderRadius: 5, background: 'var(--accent)' }} /> : null}</span>
            {t(n.label)}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
