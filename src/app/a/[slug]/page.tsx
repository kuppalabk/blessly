import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/server/db';
import { AppError } from '@/server/errors';
import { getPublicAlbum } from '@/server/services/albums';
import { AlbumView } from '@/components/albums/AlbumView';
import { OCCASIONS } from '@/lib/i18n-data';
import { GuestUpload } from './GuestUpload';
import { getT } from '@/server/i18n';

async function load(slug: string) {
  return getPublicAlbum(getDb(), slug).catch((e) => { if (e instanceof AppError && e.status === 404) notFound(); throw e; });
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { album, ownerName, photos } = await load((await params).slug);
  const cover = photos.find((p) => p.id === album.coverPhotoId) ?? photos[0];
  return { title: album.title, description: (await getT()).tp(photos.length, '{n} photo shared by {name} on Blessly', '{n} photos shared by {name} on Blessly', { name: ownerName }), robots: { index: false }, openGraph: { title: album.title, images: cover ? [cover.thumbUrl] : [] } };
}

export default async function PublicAlbum({ params }: { params: Promise<{ slug: string }> }) {
  const { t } = await getT();
  const { slug } = await params;
  const { album, ownerName, photos } = await load(slug);
  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '16px 12px 48px' }} className="stack-lg">
      <AlbumView titleAs="h1" title={album.title} subtitle={`${t(OCCASIONS.find((o) => o.id === album.occasion)?.label ?? '')} · ${t('shared by {name}', { name: ownerName })}`} designIndex={album.designIndex} photos={photos} />
      {album.guestUploads && <GuestUpload slug={slug} />}
      <p className="muted small" style={{ textAlign: 'center' }}>{t("Made with")}{' '}<Link href="/">{t("Blessly")}</Link> {' '}{t("— reminders, wishes and albums for every occasion.")}</p>
    </main>
  );
}
