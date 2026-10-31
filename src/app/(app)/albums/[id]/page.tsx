import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/server/db';
import { pageUser } from '@/server/http';
import { AppError } from '@/server/errors';
import { getAlbum } from '@/server/services/albums';
import { canEdit, listFamilies } from '@/server/services/family';
import { Icon } from '@/components/Icon';
import { AlbumEditor } from './AlbumEditor';
import { getT } from '@/server/i18n';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("Album") };
}

export default async function AlbumPage({ params }: { params: Promise<{ id: string }> }) {
  const { t } = await getT();
  const user = await pageUser();
  const v = await getAlbum(getDb(), user.id, (await params).id).catch((e) => { if (e instanceof AppError && e.status === 404) notFound(); throw e; });
  const families = v.isOwner ? (await listFamilies(getDb(), user.id)).filter((f) => canEdit(f.role)).map((f) => ({ id: f.id, name: f.name })) : [];
  return (
    <div className="stack-lg" style={{ maxWidth: 1000 }}>
      <header className="row"><Link href="/albums" className="btn btn-ghost btn-sm" aria-label={t("All albums")}><Icon name="back" size={18} /></Link><h1 className="grow">{v.album.title}</h1></header>
      <AlbumEditor userId={user.id} isOwner={v.isOwner} canAdd={v.canAdd} maxPhotos={v.maxPhotos} families={families}
        album={{ id: v.album.id, title: v.album.title, occasion: v.album.occasion, designIndex: v.album.designIndex, slug: v.album.slug, guestUploads: v.album.guestUploads, familyId: v.album.familyId, coverPhotoId: v.album.coverPhotoId }}
        photos={v.photos.map((p) => ({ id: p.id, thumbUrl: p.thumbUrl, fullUrl: p.fullUrl, width: p.width, height: p.height, caption: p.caption, uploader: p.uploader, uploadedBy: p.uploadedBy }))} />
    </div>
  );
}
