'use client';
import Link from 'next/link';
import { OccasionOptions } from '@/components/occasions/OccasionPicker';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ApiError, api } from '@/components/api';
import { ErrorMessage } from '@/components/ErrorMessage';
import { Icon } from '@/components/Icon';
import { AlbumView, type ViewPhoto } from '@/components/albums/AlbumView';
import { DesignPicker } from '@/components/albums/DesignPicker';
import { albumDesign } from '@/lib/albums';
import { OCCASIONS } from '@/lib/i18n-data';
import { useT } from '@/components/I18n';

type Photo = ViewPhoto & { uploader: string; uploadedBy: string | null };
type Album = { id: string; title: string; occasion: string; designIndex: number; slug: string | null; guestUploads: boolean; familyId: string | null; coverPhotoId: string | null };
type Upload = { name: string; state: 'waiting' | 'uploading' | 'done' | 'error'; error?: unknown };

export function AlbumEditor({ album, photos, isOwner, canAdd, userId, maxPhotos, families }: { album: Album; photos: Photo[]; isOwner: boolean; canAdd: boolean; userId: string; maxPhotos: number; families: { id: string; name: string }[] }) {
  const { t: tr } = useT();
  const router = useRouter();
  const [tab, setTab] = useState<'photos' | 'design' | 'share' | 'settings'>('photos');
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [design, setDesign] = useState(album.designIndex);
  const [error, setError] = useState<unknown>(null);
  const [origin, setOrigin] = useState('');
  const [settings, setSettings] = useState({ title: album.title, occasion: album.occasion, familyId: album.familyId ?? '' });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [guests, setGuests] = useState(album.guestUploads);
  useEffect(() => setGuests(album.guestUploads), [album.guestUploads]);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => setOrigin(window.location.origin), []);

  async function patch(body: Record<string, unknown>) {
    setError(null);
    try { await api(`/api/albums/${album.id}`, { method: 'PATCH', body }); router.refresh(); } catch (e) { setError(e); }
  }

  async function upload(files: FileList) {
    const list = Array.from(files).slice(0, 100);
    setUploads(list.map((f) => ({ name: f.name, state: 'waiting' })));
    for (let i = 0; i < list.length; i++) {
      setUploads((u) => u.map((x, k) => (k === i ? { ...x, state: 'uploading' } : x)));
      const form = new FormData();
      form.append('photo', list[i]);
      const res = await fetch(`/api/albums/${album.id}/photos`, { method: 'POST', body: form, credentials: 'same-origin' });
      const json = await res.json().catch(() => ({}));
      const err = res.ok ? undefined : new ApiError(res.status, json.error ?? tr('Upload failed'), undefined, json.code);
      setUploads((u) => u.map((x, k) => (k === i ? { ...x, state: res.ok ? 'done' : 'error', error: err } : x)));
      if (err?.code === 'plan_limit') { setUploads((u) => u.map((x, k) => (k > i ? { ...x, state: 'error', error: err } : x))); break; }
    }
    router.refresh();
    if (fileRef.current) fileRef.current.value = '';
  }

  const link = album.slug ? `${origin}/a/${album.slug}` : '';
  const share = encodeURIComponent(`${album.title} — see the photos: ${link}`);
  return (
    <div className="stack-lg">
      <div className="row-wrap" role="tablist" aria-label={tr("Album")}>
        {(['photos', 'design', 'share', 'settings'] as const).filter((t) => isOwner || t === 'photos').map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className="chip" aria-pressed={tab === t} onClick={() => setTab(t)}>{{ photos: tr('Photos ({n})', { n: photos.length }), design: tr('Design'), share: tr('Share'), settings: tr('Settings') }[t]}</button>
        ))}
      </div>

      {tab === 'photos' && (
        <section className="stack" aria-label={tr("Photos")}>
          {canAdd && (
            <div className="card-box stack">
              <label className="btn" style={{ cursor: 'pointer' }}><Icon name="plus" size={18} />{tr("Add photos")}<input ref={fileRef} type="file" accept="image/*" multiple className="sr-only" aria-label={tr("Choose photos")} onChange={(e) => e.target.files?.length && upload(e.target.files)} />
              </label>
              <p className="muted small">{tr("{length} of {maxPhotos} photos · JPG, PNG, WebP or GIF up to 15 MB. Location data is removed from every photo.", { length: photos.length, maxPhotos })}</p>
              {uploads.length > 0 && (
                <ul className="list small" aria-label={tr("Uploads")} style={{ gap: 4 }}>
                  {uploads.map((u, i) => <li key={i} className="row" style={{ gap: 8 }}><span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</span><span className={`badge ${u.state === 'done' ? 'badge-green' : u.state === 'error' ? 'badge-hot' : ''}`}>{{ waiting: tr('Waiting'), uploading: tr('Uploading…'), done: tr('Added'), error: tr('Failed') }[u.state]}</span></li>)}
                </ul>
              )}
              {uploads.filter((u) => u.error).slice(0, 1).map((u, i) => <ErrorMessage key={i} error={u.error} />)}
            </div>
          )}
          {photos.length === 0 ? <p className="muted">{tr("No photos yet.")}</p> : (
            <div className="grid-cards">
              {photos.map((p) => {
                const mayEdit = isOwner || p.uploadedBy === userId;
                return (
                  <figure key={p.id} className="card-box stack" style={{ margin: 0, padding: 8, gap: 6 }}>
                    <img src={p.thumbUrl} alt={p.caption ?? tr("Photo by {uploader}", { uploader: p.uploader })} loading="lazy" style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 10 }} />
                    <figcaption className="muted small">{tr("by")}{' '}{p.uploader}{album.coverPhotoId === p.id ? tr(" · cover") : ''}</figcaption>
                    {mayEdit && (
                      <>
                        <input className="input" style={{ minHeight: 38, fontSize: 14 }} aria-label={tr("Caption")} placeholder={tr("Add a caption")} defaultValue={p.caption ?? ''} maxLength={200}
                          onBlur={async (e) => { if (e.target.value !== (p.caption ?? '')) { await api(`/api/photos/${p.id}`, { method: 'PATCH', body: { caption: e.target.value } }).catch(setError); router.refresh(); } }} />
                        <div className="row" style={{ gap: 4 }}>
                          {isOwner && album.coverPhotoId !== p.id && <button className="btn btn-ghost btn-sm grow" onClick={() => patch({ coverPhotoId: p.id })}>{tr("Make cover")}</button>}
                          <button className="btn btn-ghost btn-sm" aria-label={tr("Remove photo")} onClick={async () => { await api(`/api/photos/${p.id}`, { method: 'DELETE' }).catch(setError); router.refresh(); }}>✕</button>
                        </div>
                      </>
                    )}
                  </figure>
                );
              })}
            </div>
          )}
        </section>
      )}

      {tab === 'design' && (
        <section className="stack" aria-label={tr("Design")}>
          <p className="muted">{tr("Design {n} of 100:", { n: design + 1 })} <b>{albumDesign(design).name}</b></p>
          <DesignPicker value={design} photos={photos} onPick={(i) => { setDesign(i); patch({ designIndex: i }); }} />
        </section>
      )}

      {tab === 'share' && (
        <section className="card-box stack" aria-label={tr("Share")}>
          {album.slug ? (
            <>
              <p>{tr("Anyone with this link can see the album.")}</p>
              <div className="link-box"><code data-testid="album-link">{link || `/a/${album.slug}`}</code><button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard.writeText(link).catch(() => undefined)}>{tr("Copy")}</button></div>
              <div className="row-wrap">
                <a className="btn btn-sm" style={{ background: '#1F7A4D' }} href={`https://wa.me/?text=${share}`} target="_blank" rel="noopener noreferrer"><Icon name="whatsapp" size={18} />{tr("WhatsApp")}</a>
                <a className="btn btn-ghost btn-sm" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`} target="_blank" rel="noopener noreferrer">{tr("Facebook")}</a>
                <Link className="btn btn-ghost btn-sm" href={`/a/${album.slug}`} target="_blank">{tr("Open")}</Link>
              </div>
              <label className="check"><input type="checkbox" checked={guests} onChange={(e) => { setGuests(e.target.checked); patch({ guestUploads: e.target.checked }); }} /><span><b>{tr("Let guests add photos")}</b><br /><span className="muted small">{tr("People with the link can upload (no account needed). You can remove any photo.")}</span></span></label>
              <button className="btn btn-ghost" onClick={() => patch({ shared: false })}>{tr("Stop sharing (the link stops working)")}</button>
            </>
          ) : (
            <>
              <p>{tr("Create a link to share the album with anyone — on WhatsApp, Facebook or by message.")}</p>
              <button className="btn" onClick={() => patch({ shared: true })}>{tr("Create share link")}</button>
            </>
          )}
        </section>
      )}

      {tab === 'settings' && (
        <section className="card-box stack" aria-label={tr("Album settings")}>
          <label className="field">{tr("Album name")}<input className="input" value={settings.title} onChange={(e) => setSettings({ ...settings, title: e.target.value })} maxLength={80} /></label>
          <label className="field">{tr("Occasion")}<select className="select" aria-label={tr("Occasion")} value={settings.occasion} onChange={(e) => setSettings({ ...settings, occasion: e.target.value })}><OccasionOptions /></select></label>
          {families.length > 0 && <label className="field">{tr("Share with family")}<select className="select" aria-label={tr("Share with family")} value={settings.familyId} onChange={(e) => setSettings({ ...settings, familyId: e.target.value })}><option value="">{tr("Only me")}</option>{families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>}
          <button className="btn" onClick={() => patch({ title: settings.title, occasion: settings.occasion, familyId: settings.familyId || null })}>{tr("Save")}</button>
          {!confirmDelete ? <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>{tr("Delete album")}</button> : (
            <div className="stack" role="alertdialog" aria-label={tr("Confirm delete")}>
              <p className="small">{tr("Delete “{title}” and all {length} photos? This can’t be undone.", { title: album.title, length: photos.length })}</p>
              <div className="row"><button className="btn btn-danger grow" onClick={async () => { await api(`/api/albums/${album.id}`, { method: 'DELETE' }); router.push('/albums'); router.refresh(); }}>{tr("Yes, delete")}</button><button className="btn btn-ghost grow" onClick={() => setConfirmDelete(false)}>{tr("Cancel")}</button></div>
            </div>
          )}
        </section>
      )}
      <ErrorMessage error={error} />

      <section className="stack" aria-label={tr("Preview")}>
        <h2 style={{ fontSize: 18 }}>{tr("Preview")}</h2>
        <AlbumView title={album.title} subtitle={tr(OCCASIONS.find((o) => o.id === album.occasion)?.label ?? '')} designIndex={design} photos={photos} />
      </section>
    </div>
  );
}
