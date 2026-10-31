import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/server/db';
import { AppError } from '@/server/errors';
import { currentUser } from '@/server/http';
import { publicWishlist } from '@/server/services/wishlists';
import { potsFor } from '@/server/services/marketplace';
import { moneyEnabled } from '@/server/services/money';
import { PublicList } from '@/components/wishlists/PublicList';
import { occasionLabel } from '@/lib/occasion-groups';
import { getT } from '@/server/i18n';
import { LanguagePicker } from '@/components/LanguagePicker';

export const dynamic = 'force-dynamic';

async function load(slug: string) {
  const viewer = await currentUser();
  const v = await publicWishlist(getDb(), slug, viewer?.id ?? null).catch((e) => { if (e instanceof AppError && e.status === 404) notFound(); throw e; });
  return { v, viewer };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { v } = await load((await params).slug);
  return { title: v.wishlist.title, description: `${v.wishlist.ownerName}’s wishlist`, robots: { index: false, follow: false } };
}

export default async function PublicWishlist({ params }: { params: Promise<{ slug: string }> }) {
  const { t, intl } = await getT();
  const { slug } = await params;
  const { v, viewer } = await load(slug);
  const w = v.wishlist;
  return (
    <main className="stack-lg" style={{ maxWidth: 680, margin: '0 auto', padding: '28px 16px 48px' }}>
      {v.isOwner && <p className="notice">{t("This is how friends see your list.")}{' '}{w.surprise ? t("What’s been reserved is hidden from you.") : ''} <Link href="/wishlists">{t("Edit your lists")}</Link></p>}
      <header className="stack" style={{ gap: 6 }}>
        <p className="eyebrow" style={{ margin: 0 }}>{t('{occasion} wishlist', { occasion: t(occasionLabel(w.occasion)) })}{w.eventDate ? ` · ${new Date(w.eventDate).toLocaleDateString(intl, { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}</p>
        <h1 style={{ margin: 0 }}>{w.title}</h1>
        <p className="muted" style={{ margin: 0 }}>{t("From {ownerName}. Tap “I’ll get this” to reserve a gift so nobody doubles up.", { ownerName: w.ownerName })}</p>
        {w.description && <p style={{ whiteSpace: 'pre-line' }}>{w.description}</p>}
        {w.shippingNote && <p className="small">📦 {w.shippingNote}</p>}
      </header>
      <PublicList slug={slug} money={moneyEnabled()} pots={await potsFor(getDb(), { wishlistItemIds: v.items.map((i) => i.id) })} items={v.items} isOwner={v.isOwner} ownerName={w.ownerName} defaultName={viewer?.name ?? ''} />
      <p className="small" style={{ textAlign: 'center' }}><Link href="/">{t("Made with Blessly · make your own wishlist")}</Link></p>
        <div className="row" style={{ justifyContent: 'center' }}><LanguagePicker /></div>
    </main>
  );
}
