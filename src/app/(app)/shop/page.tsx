import { notFound } from 'next/navigation';
import { getDb } from '@/server/db';
import { pageUser } from '@/server/http';
import { moneyEnabled } from '@/server/services/money';
import { shopProducts } from '@/server/services/marketplace';
import { BuyProduct, TestModeBanner } from '@/components/money/MoneyUI';
import { getT } from '@/server/i18n';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("Shop") };
}

export default async function Shop() {
  const { t } = await getT();
  const user = await pageUser();
  if (!moneyEnabled()) notFound();
  const items = await shopProducts(getDb());
  return (
    <div className="stack-lg" style={{ maxWidth: 1000 }}>
      <header><h1>{t("Shop")}</h1><p className="muted small" style={{ margin: 0 }}>{t("Gifts from independent sellers, reviewed by Blessly and delivered by the seller.")}</p></header>
      <TestModeBanner />
      {items.length === 0 && <p className="muted">{t("No products yet.")}</p>}
      <div className="grid-cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
        {items.map((p) => (
          <article key={p.id} className="card-box stack" style={{ gap: 8 }}>
            {p.imageUrl ? <img src={p.imageUrl} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 12 }} /> : <div aria-hidden style={{ aspectRatio: '1', borderRadius: 12, background: 'var(--soft)', display: 'grid', placeItems: 'center', fontSize: 48 }}>🎁</div>}
            <b>{p.title}</b>
            <span className="muted small">{t("{seller} · delivers to {v}", { seller: p.seller, v: p.countries.join(', ') })}</span>
            {p.description && <p className="small" style={{ margin: 0 }}>{p.description}</p>}
            <div className="row between"><b>{p.price}</b><span className="muted small">{t("{stock} left", { stock: p.stock })}</span></div>
            <BuyProduct id={p.id} countries={p.countries} stock={p.stock} defaultCountry={user.country} />
          </article>
        ))}
      </div>
    </div>
  );
}
