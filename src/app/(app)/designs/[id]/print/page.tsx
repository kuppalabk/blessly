import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/server/db';
import { AppError } from '@/server/errors';
import { pageUser } from '@/server/http';
import { moneyEnabled } from '@/server/services/money';
import { getDesign } from '@/server/services/designs';
import { PRINT_COUNTRIES, PRINT_PRICE } from '@/server/services/marketplace';
import { PrintOrderForm, TestModeBanner } from '@/components/money/MoneyUI';
import { Icon } from '@/components/Icon';
import { currencyFor } from '@/lib/money';
import { getT } from '@/server/i18n';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("Print and post") };
}

export default async function Print({ params }: { params: Promise<{ id: string }> }) {
  const { t } = await getT();
  const user = await pageUser();
  if (!moneyEnabled()) notFound();
  const d = await getDesign(getDb(), user.id, (await params).id).catch((e) => { if (e instanceof AppError && e.status === 404) notFound(); throw e; });
  return (
    <div className="stack-lg" style={{ maxWidth: 760 }}>
      <header className="row"><Link href={`/designs/${d.id}`} className="btn btn-ghost btn-sm" aria-label={t("Back to the card")}><Icon name="back" size={18} /></Link><h1>{t("Print and post “{title}”", { title: d.title })}</h1></header>
      <TestModeBanner />
      {d.frontUrl && d.insideUrl ? (
        <>
          <div className="row" style={{ gap: 12 }}>
            <img src={d.frontUrl} alt={t("Front of the card")} style={{ width: 140, borderRadius: 10 }} />
            <img src={d.insideUrl} alt={t("Inside of the card")} style={{ width: 140, borderRadius: 10 }} />
          </div>
          <PrintOrderForm designId={d.id} prices={PRINT_PRICE} countries={PRINT_COUNTRIES} defaultCountry={user.country} currency={currencyFor(user.country)} />
        </>
      ) : <p className="notice">{t("Open the card and tap")}{' '}<b>{t("Use this card for a wish")}</b> {' '}{t("or")}{' '}<b>{t("Print-ready PDF")}</b> {' '}{t("first, so we have the finished pictures to print.")}</p>}
    </div>
  );
}
