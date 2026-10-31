import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/server/db';
import { AppError } from '@/server/errors';
import { pageUser } from '@/server/http';
import { ownerView } from '@/server/services/wishlists';
import { WishlistEditor } from '@/components/wishlists/WishlistEditor';
import { Icon } from '@/components/Icon';
import { getT } from '@/server/i18n';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("Wishlist") };
}

export default async function WishlistPage({ params }: { params: Promise<{ id: string }> }) {
  const { t } = await getT();
  const user = await pageUser();
  const v = await ownerView(getDb(), user.id, (await params).id).catch((e) => { if (e instanceof AppError && e.status === 404) notFound(); throw e; });
  const currency = { IN: 'INR', US: 'USD', GB: 'GBP', AE: 'AED' }[user.country] ?? 'EUR';
  return (
    <div className="stack-lg" style={{ maxWidth: 900 }}>
      <header className="row"><Link href="/wishlists" className="btn btn-ghost btn-sm" aria-label={t("Back to wishlists")}><Icon name="back" size={18} /></Link><h1>{v.wishlist.title}</h1></header>
      <WishlistEditor id={v.wishlist.id} slug={v.wishlist.slug} title={v.wishlist.title} surprise={v.wishlist.surprise} hidden={v.hidden} reservedCount={v.reservedCount} appUrl={process.env.APP_URL ?? ''} items={v.items} defaultCurrency={currency} />
    </div>
  );
}
