import { useCallback, useState } from 'react';
import { Alert, Image, Linking, Pressable, StyleSheet, Switch, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { Button, ErrorText, Field, Loading, Screen, Section, colors } from '../../src/ui';
import { t } from '../../src/i18n';
import { API_URL } from '../../src/config';
import { me } from '../../src/api/endpoints';
import { OCCASION_GROUPS, OCCASION_LABELS, absUrl } from '../../src/api/celebrations';
import {
  ALBUM_DESIGNS, ALBUM_THEMES, albumDesign, deleteAlbum, deletePhoto, getAlbum, listEditableFamilies, updateAlbum,
  updatePhotoCaption, uploadAlbumPhoto, type AlbumDetail, type AlbumPhoto, type FamilyChoice,
} from '../../src/api/albums';
import { ApiError } from '../../src/api/client';

type Tab = 'photos' | 'design' | 'share' | 'settings';
type Upload = { name: string; state: 'waiting' | 'uploading' | 'done' | 'error'; error?: string };
type Settings = { title: string; occasion: string; familyId: string };

const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
const errText = (e: unknown) => (e instanceof Error ? e.message : t('Something went wrong'));

/** The album editor: photos, design, sharing and settings. Same features as the website. */
export default function AlbumEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const [detail, setDetail] = useState<AlbumDetail | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [families, setFamilies] = useState<FamilyChoice[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('photos');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [copied, setCopied] = useState(false);

  const reload = useCallback(async () => {
    const d = await getAlbum(id);
    setDetail(d);
    setSettings((prev) => prev ?? { title: d.album.title, occasion: d.album.occasion, familyId: d.album.familyId ?? '' });
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      reload().then(() => setLoadError(null)).catch(() => setLoadError(t('Could not load this album.')));
      me().then((r) => setMeId(r.user.id)).catch(() => undefined);
      listEditableFamilies().then((r) => setFamilies(r.families)).catch(() => undefined);
    }, [reload]),
  );

  async function run(key: string, fn: () => Promise<string | void>) {
    setBusy(key); setError(null); setNotice(null);
    try {
      const m = await fn();
      if (m) setNotice(m);
      await reload();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(null);
    }
  }

  const patch = (body: Record<string, unknown>) => run('patch', () => updateAlbum(id, body).then(() => undefined));

  function confirm(message: string, action: string, onYes: () => void) {
    Alert.alert(message, undefined, [
      { text: t('Cancel'), style: 'cancel' },
      { text: action, style: 'destructive', onPress: onYes },
    ]);
  }

  /** Uploads the picked photos one after another, the same way the website does. */
  async function addPhotos() {
    setBusy('add'); setError(null); setNotice(null);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 100, quality: 0.9 });
      if (res.canceled) return;
      const list = res.assets.slice(0, 100);
      setUploads(list.map((a) => ({ name: a.fileName ?? t('Photo'), state: 'waiting' })));
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        setUploads((u) => u.map((x, k) => (k === i ? { ...x, state: 'uploading' } : x)));
        try {
          if ((a.fileSize ?? 0) > MAX_PHOTO_BYTES) throw new Error(t('Photos can be up to 15 MB'));
          await uploadAlbumPhoto(id, a);
          setUploads((u) => u.map((x, k) => (k === i ? { ...x, state: 'done' } : x)));
        } catch (e) {
          const message = errText(e);
          const planLimit = e instanceof ApiError && e.code === 'plan_limit';
          setUploads((u) => u.map((x, k) => (k === i || (planLimit && k > i) ? { ...x, state: 'error', error: message } : x)));
          if (planLimit) break;
        }
      }
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(null);
      await reload().catch(() => undefined);
    }
  }

  if (!detail || !settings) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('Album') }} />
        {loadError ? <ErrorText>{loadError}</ErrorText> : <Loading />}
      </Screen>
    );
  }

  const a = detail.album;
  const photos = detail.photos;
  const isOwner = detail.isOwner;
  const link = a.slug ? `${API_URL}/a/${a.slug}` : '';
  const tabs: Tab[] = isOwner ? ['photos', 'design', 'share', 'settings'] : ['photos'];
  const tabLabel: Record<Tab, string> = {
    photos: t('Photos ({n})', { n: photos.length }), design: t('Design'), share: t('Share'), settings: t('Settings'),
  };
  const cardW = (width - 32 - 10) / 2;
  const tileW = (width - 32 - 8 * 4) / 5;
  const design = albumDesign(a.designIndex);

  return (
    <Screen>
      <Stack.Screen options={{ title: a.title }} />

      <View style={s.tabs} accessibilityRole="tablist">
        {tabs.map((k) => (
          <Pressable key={k} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} style={[s.tab, tab === k && s.tabOn]}>
            <Text style={[s.tabText, tab === k && s.tabTextOn]}>{tabLabel[k]}</Text>
          </Pressable>
        ))}
      </View>

      {notice ? <Text style={s.notice} accessibilityRole="alert">{notice}</Text> : null}
      <ErrorText>{error}</ErrorText>

      {tab === 'photos' && (
        <View style={{ gap: 16 }}>
          {detail.canAdd && (
            <Section>
              <Button label={t('Add photos')} busy={busy === 'add'} onPress={() => void addPhotos()} />
              <Text style={s.muted}>
                {t('{length} of {maxPhotos} photos · JPG, PNG, WebP or GIF up to 15 MB. Location data is removed from every photo.', { length: photos.length, maxPhotos: detail.maxPhotos })}
              </Text>
              {uploads.map((u, i) => (
                <View key={i} style={s.uploadRow}>
                  <Text style={[s.small, { flex: 1 }]} numberOfLines={1}>{u.name}</Text>
                  <Text style={[s.badge, u.state === 'done' && s.badgeGreen, u.state === 'error' && s.badgeRed]}>
                    {{ waiting: t('Waiting'), uploading: t('Uploading…'), done: t('Added'), error: t('Failed') }[u.state]}
                  </Text>
                </View>
              ))}
              {uploads.filter((u) => u.error).slice(0, 1).map((u, i) => <ErrorText key={i}>{u.error ?? null}</ErrorText>)}
            </Section>
          )}

          {photos.length === 0 ? <Text style={s.muted}>{t('No photos yet.')}</Text> : (
            <View style={s.grid}>
              {photos.map((p) => (
                <PhotoCard
                  key={p.id} photo={p} width={cardW} isCover={a.coverPhotoId === p.id}
                  mayEdit={isOwner || p.uploadedBy === meId} isOwner={isOwner} disabled={!!busy}
                  onCaption={(text) => {
                    if (text === (p.caption ?? '')) return;
                    void run('cap' + p.id, () => updatePhotoCaption(p.id, text).then(() => undefined));
                  }}
                  onCover={() => void patch({ coverPhotoId: p.id })}
                  onRemove={() => void run('rm' + p.id, () => deletePhoto(p.id).then(() => undefined))}
                />
              ))}
            </View>
          )}
        </View>
      )}

      {tab === 'design' && isOwner && (
        <View style={{ gap: 12 }}>
          <Text style={s.muted}>{t('Design {n} of 100:', { n: design.number })} <Text style={s.bold}>{design.name}</Text></Text>
          <View style={s.designGrid}>
            {Array.from({ length: ALBUM_DESIGNS }, (_, i) => albumDesign(i)).map((d) => {
              const on = d.index === a.designIndex;
              return (
                <Pressable
                  key={d.index} onPress={() => void patch({ designIndex: d.index })} disabled={!!busy}
                  accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={d.name}
                  style={[s.tile, { width: tileW, backgroundColor: d.theme.bg, borderColor: on ? colors.brand : colors.line, borderWidth: on ? 3 : 1 }]}
                >
                  <View style={[s.tileDot, { backgroundColor: d.theme.accent }]} />
                  <Text style={[s.tileText, { color: d.theme.ink }]}>{d.number}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={s.swatches}>
            {ALBUM_THEMES.map((th) => <Text key={th.name} style={[s.small, { color: th.accent }]}>{th.name}</Text>)}
          </View>
        </View>
      )}

      {tab === 'share' && isOwner && (
        <Section title={t('Share')}>
          {a.slug ? (
            <View style={{ gap: 12 }}>
              <Text style={s.body}>{t('Anyone with this link can see the album.')}</Text>
              <View style={s.linkBox}>
                <Text selectable style={s.link} numberOfLines={1}>{link}</Text>
                <Mini label={copied ? t('Copied') : t('Copy')} onPress={async () => {
                  await Clipboard.setStringAsync(link);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }} />
              </View>
              <View style={s.wrap}>
                <Mini label={t('WhatsApp')} onPress={() => Linking.openURL(`https://wa.me/?text=${encodeURIComponent(`${a.title} — see the photos: ${link}`)}`)} />
                <Mini label={t('Facebook')} onPress={() => Linking.openURL(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`)} />
                <Mini label={t('Open')} onPress={() => Linking.openURL(link)} />
              </View>
              <View style={s.toggle}>
                <View style={{ flex: 1 }}>
                  <Text style={s.bold}>{t('Let guests add photos')}</Text>
                  <Text style={s.muted}>{t('People with the link can upload (no account needed). You can remove any photo.')}</Text>
                </View>
                <Switch
                  value={a.guestUploads} disabled={!!busy}
                  onValueChange={(v) => void patch({ guestUploads: v })}
                  trackColor={{ true: colors.brand, false: colors.line }}
                />
              </View>
              <Button label={t('Stop sharing (the link stops working)')} variant="secondary" disabled={!!busy} onPress={() => void patch({ shared: false })} />
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              <Text style={s.body}>{t('Create a link to share the album with anyone — on WhatsApp, Facebook or by message.')}</Text>
              <Button label={t('Create share link')} disabled={!!busy} onPress={() => void patch({ shared: true })} />
            </View>
          )}
        </Section>
      )}

      {tab === 'settings' && isOwner && (
        <Section title={t('Album settings')}>
          <Field label={t('Album name')} value={settings.title} onChangeText={(x) => setSettings({ ...settings, title: x })} maxLength={80} />
          <Text style={s.label}>{t('Occasion')}</Text>
          {OCCASION_GROUPS.map((g) => (
            <View key={g.id} style={{ gap: 6 }}>
              <Text style={s.groupLabel}>{t(g.label)}</Text>
              <View style={s.wrap}>
                {g.ids.map((oid) => <Chip key={oid} label={t(OCCASION_LABELS[oid])} selected={settings.occasion === oid} onPress={() => setSettings({ ...settings, occasion: oid })} />)}
              </View>
            </View>
          ))}
          {families.length > 0 && (
            <>
              <Text style={s.label}>{t('Share with family')}</Text>
              <View style={s.wrap}>
                <Chip label={t('Only me')} selected={settings.familyId === ''} onPress={() => setSettings({ ...settings, familyId: '' })} />
                {families.map((f) => <Chip key={f.id} label={f.name} selected={settings.familyId === f.id} onPress={() => setSettings({ ...settings, familyId: f.id })} />)}
              </View>
            </>
          )}
          <Button label={t('Save')} variant="secondary" busy={busy === 'patch'} onPress={() => void patch({ title: settings.title, occasion: settings.occasion, familyId: settings.familyId || null })} />
          <Button label={t('Delete album')} variant="danger" disabled={!!busy} onPress={() =>
            confirm(t('Delete “{title}” and all {length} photos? This can’t be undone.', { title: a.title, length: photos.length }), t('Yes, delete'), () => {
              setBusy('delete');
              deleteAlbum(id)
                .then(() => router.replace('/albums'))
                .catch((e) => setError(errText(e)))
                .finally(() => setBusy(null));
            })} />
        </Section>
      )}
      <View style={{ height: 8 }} />
    </Screen>
  );
}

/** One photo in the grid, with a caption, cover and remove actions for the people allowed to change it. */
function PhotoCard({ photo, width, isCover, mayEdit, isOwner, disabled, onCaption, onCover, onRemove }: {
  photo: AlbumPhoto; width: number; isCover: boolean; mayEdit: boolean; isOwner: boolean; disabled: boolean;
  onCaption: (text: string) => void; onCover: () => void; onRemove: () => void;
}) {
  return (
    <View style={[s.photoCard, { width }]}>
      <Image source={{ uri: absUrl(photo.thumbUrl) }} style={[s.photo, { width: width - 16 }]} resizeMode="cover" accessibilityLabel={photo.caption ?? t('Photo by {uploader}', { uploader: photo.uploader })} />
      <Text style={s.muted}>{t('by')} {photo.uploader}{isCover ? t(' · cover') : ''}</Text>
      {mayEdit && (
        <>
          <TextInput
            style={s.caption} defaultValue={photo.caption ?? ''} placeholder={t('Add a caption')} placeholderTextColor={colors.muted}
            maxLength={200} accessibilityLabel={t('Caption')} editable={!disabled}
            onEndEditing={(e) => onCaption(e.nativeEvent.text.trim())}
          />
          <View style={s.wrap}>
            {isOwner && !isCover && <Mini label={t('Make cover')} disabled={disabled} onPress={onCover} />}
            <Mini label={t('Remove photo')} danger disabled={disabled} onPress={onRemove} />
          </View>
        </>
      )}
    </View>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!selected }} style={[s.chip, selected && s.chipOn]}>
      <Text style={[s.chipText, selected && s.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

function Mini({ label, onPress, disabled, danger }: { label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={({ pressed }) => [s.mini, disabled && { opacity: 0.5 }, pressed && { opacity: 0.7 }]}>
      <Text style={[s.miniText, danger && { color: colors.danger }]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  muted: { fontSize: 14, color: colors.muted },
  label: { fontSize: 14, color: colors.muted },
  groupLabel: { fontSize: 13, fontWeight: '600', color: colors.muted, marginTop: 4 },
  small: { fontSize: 14, color: colors.text },
  bold: { fontSize: 15, fontWeight: '600', color: colors.text },
  body: { fontSize: 15, color: colors.text, lineHeight: 21 },
  notice: { fontSize: 14, color: colors.brand, fontWeight: '600' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tab: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  tabOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  tabText: { fontSize: 14, color: colors.text },
  tabTextOn: { color: '#fff' },
  uploadRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  badge: { fontSize: 12, fontWeight: '600', color: colors.muted, backgroundColor: colors.page, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 999, overflow: 'hidden' },
  badgeGreen: { color: '#1F7A4D' },
  badgeRed: { color: colors.danger },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoCard: { backgroundColor: colors.surface, borderRadius: 14, padding: 8, gap: 6 },
  photo: { aspectRatio: 1, borderRadius: 10 },
  caption: { borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: colors.text, backgroundColor: colors.surface },
  designGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { aspectRatio: 0.8, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 4 },
  tileDot: { width: 10, height: 10, borderRadius: 5 },
  tileText: { fontSize: 13, fontWeight: '600' },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  linkBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 10, backgroundColor: colors.page },
  link: { flex: 1, fontSize: 13, color: colors.text },
  mini: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  miniText: { fontSize: 13, fontWeight: '600', color: colors.brand },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontSize: 14, color: colors.text },
  chipTextOn: { color: '#fff' },
});
