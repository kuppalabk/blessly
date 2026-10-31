import { useCallback, useState } from 'react';
import { Alert, Image, Linking, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { Button, ErrorText, Field, Loading, Screen, Section, colors, styles as shared } from '../../src/ui';
import { t } from '../../src/i18n';
import { API_URL } from '../../src/config';
import { me } from '../../src/api/endpoints';
import { absUrl } from '../../src/api/celebrations';
import {
  CURRENCIES, addItem, defaultCurrency, deleteItem, deleteWishlist, getWishlist, moveItem, revealWishlist, thankGivers,
  updateItem, updateWishlist, uploadItemPhoto, type ItemInput, type Priority, type WishItem, type WishlistDetail,
} from '../../src/api/wishlists';

const PRIORITY: [Priority, string][] = [[1, 'Must have'], [2, 'Would love'], [3, 'Nice to have']];
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
const errText = (e: unknown) => (e instanceof Error ? e.message : t('Something went wrong'));

type ItemForm = { title: string; url: string; price: string; currency: string; notes: string; priority: Priority; quantity: string };

/** The owner's view of one wishlist. Same features as the website: items, photos, reservations, reveal and thank-yous. */
export default function WishlistOwner() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [view, setView] = useState<WishlistDetail | null>(null);
  const [defaultCur, setDefaultCur] = useState('EUR');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<WishItem | null>(null);
  const [form, setForm] = useState<ItemForm | null>(null);
  const [thanks, setThanks] = useState('');
  const [copied, setCopied] = useState(false);

  const reload = useCallback(async () => {
    const v = await getWishlist(id);
    setView(v);
    setThanks((prev) => prev || t('Thank you so much for the lovely gift — it means a lot!'));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      reload().then(() => setLoadError(null)).catch(() => setLoadError(t('Could not load this wishlist.')));
      me().then((r) => setDefaultCur(defaultCurrency(r.user.country))).catch(() => undefined);
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

  function startNew() {
    setEditing(null);
    setForm({ title: '', url: '', price: '', currency: defaultCur, notes: '', priority: 2, quantity: '1' });
  }

  function startEdit(i: WishItem) {
    setEditing(i);
    setForm({
      title: i.title, url: i.url ?? '', price: i.priceMinor != null ? String(i.priceMinor / 100) : '', currency: i.currency ?? defaultCur,
      notes: i.notes ?? '', priority: i.priority, quantity: String(i.quantity),
    });
  }

  function saveItem() {
    if (!form || !form.title.trim()) return;
    const input: ItemInput = {
      title: form.title, url: form.url, price: form.price, currency: form.currency, notes: form.notes,
      priority: form.priority, quantity: Number(form.quantity) || 1,
    };
    void run('save', async () => {
      if (editing) await updateItem(id, editing.id, input);
      else await addItem(id, input);
      setForm(null);
      setEditing(null);
    });
  }

  async function pickPhoto(item: WishItem) {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
      if (res.canceled || !res.assets[0]) return;
      const asset = res.assets[0];
      if ((asset.fileSize ?? 0) > MAX_PHOTO_BYTES) { setError(t('Photos can be up to 15 MB')); return; }
      await run('ph' + item.id, () => uploadItemPhoto(id, item.id, asset).then(() => undefined));
    } catch (e) {
      setError(errText(e));
    }
  }

  function confirm(message: string, action: string, onYes: () => void) {
    Alert.alert(message, undefined, [
      { text: t('Cancel'), style: 'cancel' },
      { text: action, style: 'destructive', onPress: onYes },
    ]);
  }

  if (!view) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('Wishlist') }} />
        {loadError ? <ErrorText>{loadError}</ErrorText> : <Loading />}
      </Screen>
    );
  }

  const w = view.wishlist;
  const link = `${API_URL}/l/${w.slug}`;
  const hidden = view.hidden;
  const items = view.items;

  return (
    <Screen>
      <Stack.Screen options={{ title: w.title }} />

      <Section>
        <View style={s.linkBox}>
          <Text selectable style={s.link} numberOfLines={1}>{link}</Text>
          <Mini label={copied ? t('Copied') : t('Copy')} onPress={async () => {
            await Clipboard.setStringAsync(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }} />
        </View>
        <View style={s.wrap}>
          <Mini label={t('View as a friend')} onPress={() => Linking.openURL(link)} />
          <Mini label={t('Share on WhatsApp')} onPress={() => Linking.openURL(`https://wa.me/?text=${encodeURIComponent(`My wishlist: ${w.title} ${link}`)}`)} />
        </View>
        <View style={s.toggle}>
          <Text style={[s.bold, { flex: 1 }]}>{t('Keep it a surprise')}</Text>
          <Switch
            value={w.surprise} disabled={!!busy}
            onValueChange={(v) => void run('sur', () => updateWishlist(id, { surprise: v }).then(() => undefined))}
            trackColor={{ true: colors.brand, false: colors.line }}
          />
        </View>

        {hidden ? (
          <View style={{ gap: 8 }}>
            <Text style={s.muted}>
              {view.reservedCount
                ? (view.reservedCount === 1 ? t('{n} gift has been reserved', { n: 1 }) : t('{n} gifts have been reserved', { n: view.reservedCount }))
                : t('Nothing reserved yet')}{' '}{t('— you won’t see what until you choose to look.')}
            </Text>
            <Mini label={t('Reveal my gifts')} disabled={!!busy} onPress={() =>
              confirm(t('See who reserved what? This spoils the surprise.'), t('Reveal my gifts'), () => void run('rev', () => revealWishlist(id).then(() => undefined)))} />
          </View>
        ) : view.reservedCount > 0 ? (
          <View style={{ gap: 8 }}>
            <Text style={s.label}>{t('Say thank you (emailed once to everyone who left an email)')}</Text>
            <TextInput style={[shared.input, s.multi]} multiline value={thanks} onChangeText={setThanks} maxLength={2000} />
            <Button label={t('Send thank-yous')} variant="secondary" busy={busy === 'thx'} onPress={() => void run('thx', async () => {
              const r = await thankGivers(id, thanks);
              return r.emailed === 1 ? t('Thank-you emailed to {n} person', { n: 1 }) : t('Thank-you emailed to {n} people', { n: r.emailed });
            })} />
          </View>
        ) : null}
      </Section>

      {form ? (
        <Section title={editing ? t('Edit item') : t('Add something you’d love')}>
          <Field label={t('What is it?')} value={form.title} onChangeText={(x) => setForm({ ...form, title: x })} maxLength={150} />
          <Field label={t('Link to the shop (optional)')} value={form.url} onChangeText={(x) => setForm({ ...form, url: x.trim() })} autoCapitalize="none" keyboardType="url" placeholder={t('https://…')} />
          <Field label={t('Price (optional)')} value={form.price} onChangeText={(x) => setForm({ ...form, price: x })} keyboardType="decimal-pad" placeholder="1499" />
          <Text style={s.label}>{t('Currency')}</Text>
          <View style={s.wrap}>
            {CURRENCIES.map((c) => <Chip key={c} label={c} selected={form.currency === c} onPress={() => setForm({ ...form, currency: c })} />)}
          </View>
          <Text style={s.label}>{t('How much you want it')}</Text>
          <View style={s.wrap}>
            {PRIORITY.map(([n, label]) => <Chip key={n} label={t(label)} selected={form.priority === n} onPress={() => setForm({ ...form, priority: n })} />)}
          </View>
          <Field label={t('How many')} value={form.quantity} onChangeText={(x) => setForm({ ...form, quantity: x.replace(/[^0-9]/g, '') })} keyboardType="number-pad" maxLength={2} />
          <Field label={t('Notes — size, colour, model (optional)')} value={form.notes} onChangeText={(x) => setForm({ ...form, notes: x })} maxLength={500} />
          <View style={s.wrap}>
            <Button label={editing ? t('Save') : t('Add to list')} variant="secondary" busy={busy === 'save'} disabled={!form.title.trim()} onPress={saveItem} />
            <Button label={t('Cancel')} variant="secondary" onPress={() => { setForm(null); setEditing(null); }} />
          </View>
        </Section>
      ) : (
        <Button label={t('Add something you’d love')} onPress={startNew} />
      )}

      <ErrorText>{error}</ErrorText>
      {notice ? <Text style={s.notice} accessibilityRole="alert">{notice}</Text> : null}

      <Section title={t('Items')}>
        {items.length === 0 && <Text style={s.muted}>{t('Your list is empty.')}</Text>}
        {items.map((i, k) => (
          <View key={i.id} style={s.item}>
            <View style={s.itemTop}>
              {i.imageUrl ? (
                <Image source={{ uri: absUrl(i.imageUrl) }} style={s.thumb} resizeMode="cover" />
              ) : (
                <View style={[s.thumb, s.thumbEmpty]}><Text style={s.muted}>{t('Gift')}</Text></View>
              )}
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={s.bold}>{i.title}{i.quantity > 1 ? ` × ${i.quantity}` : ''}</Text>
                <Text style={s.muted}>{[t(PRIORITY.find(([n]) => n === i.priority)?.[1] ?? 'Would love'), i.price, i.notes].filter(Boolean).join(' · ')}</Text>
                {i.url ? <Text style={s.link} numberOfLines={1} onPress={() => Linking.openURL(i.url!)}>{hostOf(i.url)}</Text> : null}
                {i.taken !== null && (
                  <Text style={s.small}>
                    {i.taken
                      ? `${t('Reserved {taken} of {quantity}', { taken: i.taken, quantity: i.quantity })}${i.reservations.length
                        ? ` — ${i.reservations.map((r) => `${r.name}${r.purchased ? ` (${t('bought')})` : ''}`).join(', ')}`
                        : ''}`
                      : t('Not reserved yet')}
                  </Text>
                )}
              </View>
            </View>
            <View style={s.wrap}>
              <Mini label="↑" disabled={k === 0 || !!busy} onPress={() => void run('mv', () => moveItem(id, i.id, 'up').then(() => undefined))} />
              <Mini label="↓" disabled={k === items.length - 1 || !!busy} onPress={() => void run('mv', () => moveItem(id, i.id, 'down').then(() => undefined))} />
              <Mini label={t('Photo')} disabled={!!busy} onPress={() => void pickPhoto(i)} />
              <Mini label={t('Edit')} onPress={() => startEdit(i)} />
              <Mini label={t('Delete')} danger disabled={!!busy} onPress={() => void run('del', () => deleteItem(id, i.id).then(() => undefined))} />
            </View>
          </View>
        ))}
      </Section>

      <Button
        label={t('Delete wishlist')} variant="secondary" busy={busy === 'dl'}
        onPress={() => confirm(t('Delete this wishlist?'), t('Delete wishlist'), () => {
          setBusy('dl');
          deleteWishlist(id)
            .then(() => router.replace('/wishlists'))
            .catch((e) => setError(errText(e)))
            .finally(() => setBusy(null));
        })}
      />
      <View style={{ height: 8 }} />
    </Screen>
  );
}

/** The host name of a link, shown under an item (for example "shop.example.com"). */
function hostOf(url: string) {
  return url.replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '');
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
  small: { fontSize: 14, color: colors.text },
  bold: { fontSize: 15, fontWeight: '600', color: colors.text },
  notice: { fontSize: 14, color: colors.brand, fontWeight: '600' },
  multi: { minHeight: 70, textAlignVertical: 'top' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  linkBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 10, backgroundColor: colors.page },
  link: { flexShrink: 1, fontSize: 13, color: colors.brand },
  mini: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  miniText: { fontSize: 13, fontWeight: '600', color: colors.brand },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontSize: 14, color: colors.text },
  chipTextOn: { color: '#fff' },
  item: { gap: 10, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  itemTop: { flexDirection: 'row', gap: 12 },
  thumb: { width: 64, height: 64, borderRadius: 10 },
  thumbEmpty: { backgroundColor: colors.page, alignItems: 'center', justifyContent: 'center' },
});
