import Link from 'next/link';
import { getDb } from '@/server/db';
import { pageUser } from '@/server/http';
import { listAlbums } from '@/server/services/albums';
import { canEdit, listFamilies } from '@/server/services/family';
import { entitlements } from '@/server/services/billing';
import { CreateAlbum } from './CreateAlbum';
import { getT } from '@/server/i18n';

export async function generateMetadata() {
  const { t, tp } = await getT();
  return { title: t("Albums") };
}

export default async function Albums() {
  const { t, tp } = await getT();
  const user = await pageUser();
  const list = await listAlbums(getDb(), user.id);
  const families = (await listFamilies(getDb(), user.id)).filter((f) => canEdit(f.role)).map((f) => ({ id: f.id, name: f.name }));
  const { plan } = await entitlements(getDb(), user.id);
  const mine = list.filter((a) => a.isMine).length;
  return (
    <div className="stack-lg" style={{ maxWidth: 1000 }}>
      <header className="row between"><div><h1>{t("Albums")}</h1><p className="muted small">{plan.maxAlbums >= 100 ? t("{mine} albums (unlimited on the {plan} plan) · {photos} photos each", { mine, plan: plan.name, photos: plan.maxPhotosPerAlbum }) : t("{mine} of {max} albums on the {plan} plan · {photos} photos each", { mine, max: plan.maxAlbums, plan: plan.name, photos: plan.maxPhotosPerAlbum })}</p></div></header>
      {list.length === 0 && <p className="muted">{t("Collect the photos from a birthday, wedding or Diwali in one album, pick one of 100 designs and share it with family — they can add their photos too.")}</p>}
      <div className="grid-cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
        {list.map((a) => (
          <Link key={a.id} href={`/albums/${a.id}`} className="card-box stack" style={{ padding: 0, overflow: 'hidden', textDecoration: 'none', color: 'var(--ink)', gap: 0 }}>
            <div style={{ aspectRatio: '4 / 3', background: a.coverUrl ? `url(${a.coverUrl}) center / cover` : 'var(--soft)' }} role="img" aria-label={a.coverUrl ? t("Cover of {title}", { title: a.title }) : t("No photos yet")} />
            <div style={{ padding: 12 }}><b>{a.title}</b><br /><span className="muted small">{tp(a.photoCount, "{n} photo", "{n} photos")}{a.familyName ? ` · ${a.familyName}` : ''}{!a.isMine ? t(" · by {ownerName}", { ownerName: a.ownerName }) : ''}{a.slug ? t(" · shared") : ''}</span></div>
          </Link>
        ))}
      </div>
      <CreateAlbum families={families} />
    </div>
  );
}
