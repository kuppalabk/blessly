import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageUser } from '@/server/http';
import { moneyEnabled } from '@/server/services/money';
import { TestModeBanner } from '@/components/money/MoneyUI';
import { getT } from '@/server/i18n';
import { msg } from '@/lib/i18n/ui';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("Gifts and payments") };
}

const LINKS: [string, string, string, string][] = [
  [msg('/pots'), '🎁', msg('Group gifts and fundraisers'), msg('Everyone chips in for one gift, or raises money for a charity')],
  [msg('/gift-cards'), '💳', msg('Gift cards'), msg('Send a gift card by email, today or on their birthday')],
  [msg('/shop'), '🛍️', msg('Shop'), msg('Gifts from independent sellers, delivered')],
  [msg('/designs'), '✉️', msg('Printed cards'), msg('Print and post a card you designed — open one of your cards')],
  [msg('/orders'), '📦', msg('My orders'), msg('Gift cards, shop orders and printed cards')],
  [msg('/partners'), '🤝', msg('Sell, design or fundraise with Blessly'), msg('Seller, card designer and charity accounts')]
];

export default async function Money() {
  const { t } = await getT();
  await pageUser();
  if (!moneyEnabled()) notFound();
  return (
    <div className="stack-lg" style={{ maxWidth: 760 }}>
      <h1>{t("Gifts and payments")}</h1>
      <TestModeBanner />
      <ul className="list">{LINKS.map(([href, icon, title, sub]) => <li key={href}><Link className="item" href={href}><span aria-hidden style={{ fontSize: 26 }}>{icon}</span><span className="grow"><b>{t(title)}</b><br /><span className="muted small">{t(sub)}</span></span><span aria-hidden>›</span></Link></li>)}</ul>
    </div>
  );
}
