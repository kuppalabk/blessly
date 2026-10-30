import Link from 'next/link';
import { getDb } from '@/server/db';
import { pageUser } from '@/server/http';
import { listWishlists } from '@/server/services/wishlists';
import { NewWishlist } from '@/components/wishlists/NewWishlist';
import { occasionLabel } from '@/lib/occasion-groups';
import type { OccasionId } from '@/lib/i18n-data';
import { getT } from '@/server/i18n';

export async function generateMetadata() {
  const { t, intl, tp } = await getT();
  return { title: t("Wishlists") };
}

export default async function Wishlists() {
  const { t, intl, tp } = await getT();
  const user = await pageUser();
  const lists = await listWishlists(getDb(), user.id);
  return (
    <div className="stack-lg" style={{ maxWidth: 900 }}>
      <header><h1>{t("Wishlists")}</h1><p className="muted small" style={{ margin: 0 }}>{t("Gift lists and registries for birthdays, weddings, babies and housewarmings. Friends reserve what they’ll buy, so nothing is doubled up — and it stays a surprise.")}</p></header>
      {lists.length > 0 && (
        <ul className="list">
          {lists.map((w) => (
            <li key={w.id}><Link className="item" href={`/wishlists/${w.id}`}><span aria-hidden style={{ fontSize: 26 }}>🎁</span><span className="grow"><b>{w.title}</b><br /><span className="muted small">{t(occasionLabel(w.occasion as OccasionId))} · {tp(w.items, "{n} item", "{n} items")}{w.eventDate ? ` · ${new Date(w.eventDate).toLocaleDateString(intl, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}</span></span></Link></li>
          ))}
        </ul>
      )}
      <NewWishlist />
    </div>
  );
}
