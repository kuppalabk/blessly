import { notFound } from 'next/navigation';
import { pageUser } from '@/server/http';
import { moneyEnabled } from '@/server/services/money';
import { giftCardCatalogue } from '@/server/services/marketplace';
import { GiftCardShop, TestModeBanner } from '@/components/money/MoneyUI';
import { currencyFor } from '@/lib/money';
import { getT } from '@/server/i18n';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("Gift cards") };
}

export default async function GiftCards() {
  const { t } = await getT();
  const user = await pageUser();
  if (!moneyEnabled()) notFound();
  return (
    <div className="stack-lg" style={{ maxWidth: 900 }}>
      <header><h1>{t("Gift cards")}</h1><p className="muted small" style={{ margin: 0 }}>{t("Choose a card, pick an amount, and we’ll email it — now, or on the day.")}</p></header>
      <TestModeBanner />
      <p className="small muted" style={{ margin: 0 }}>{t("These are sandbox brands for testing. Real brands come from a gift card partner once it’s connected.")}</p>
      <GiftCardShop brands={giftCardCatalogue()} currency={currencyFor(user.country)} />
    </div>
  );
}
