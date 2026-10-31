import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Button, ErrorText, Field, Loading, Screen, Section, colors, styles as shared } from '../../src/ui';
import { t } from '../../src/i18n';
import { me } from '../../src/api/endpoints';
import { listWishlists } from '../../src/api/wishlists';
import {
  OCCASION_GROUPS, OCCASION_LABELS, absUrl, createCelebration, designArt, emptyCelebration, updateCelebration,
  type CelebrationInput, type CelebrationRow, type Visibility,
} from '../../src/api/celebrations';

const VISIBILITY: [Visibility, string, string][] = [
  ['link', 'Anyone with the link', 'Not listed anywhere; share the link with who you like.'],
  ['invite', 'Invited guests only', 'Each guest gets a personal link. Nobody else can open the page.'],
  ['public', 'Public', 'Anyone can open it and RSVP — good for community events.'],
];

/** The create screen. Plan a celebration, then open its page. */
export default function NewCelebration() {
  const { occasion } = useLocalSearchParams<{ occasion?: string }>();
  const [init, setInit] = useState<CelebrationInput | null>(null);
  const [wishlists, setWishlists] = useState<{ id: string; title: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fallbackTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    Promise.all([me().then((r) => r.user.timezone).catch(() => fallbackTz), listWishlists().then((r) => r.wishlists).catch(() => [])])
      .then(([tz, lists]) => {
        setWishlists(lists.map((w) => ({ id: w.id, title: w.title })));
        setInit(emptyCelebration(tz || fallbackTz, occasion && OCCASION_LABELS[occasion] ? occasion : 'birthday'));
      })
      .catch(() => setError(t('Could not load.')));
  }, [occasion]);

  return (
    <Screen>
      <Stack.Screen options={{ title: t('Plan a celebration') }} />
      <ErrorText>{error}</ErrorText>
      {init ? (
        <CelebrationForm
          initial={init}
          wishlists={wishlists}
          onSaved={(c) => router.replace(`/celebrations/${c.id}`)}
        />
      ) : error ? null : <Loading />}
    </Screen>
  );
}

/* ---------------- Shared form (also used by the host page's Details tab) ---------------- */

export function CelebrationForm({ initial, id, wishlists, onSaved }: {
  initial: CelebrationInput; id?: string; wishlists: { id: string; title: string }[]; onSaved: (c: CelebrationRow) => void;
}) {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof CelebrationInput>(k: K, val: CelebrationInput[K]) => setV((x) => ({ ...x, [k]: val }));

  function problem(): string | null {
    if (v.title.trim().length < 2) return t('Give it a name');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date)) return t('Choose a date');
    if (!/^\d{2}:\d{2}$/.test(v.time)) return t('Choose a time');
    if (v.endTime && !/^\d{2}:\d{2}$/.test(v.endTime)) return t('Use the time format HH:MM');
    if (v.rsvpDeadline && !/^\d{4}-\d{2}-\d{2}$/.test(v.rsvpDeadline)) return t('Use the date format YYYY-MM-DD');
    if (v.onlineUrl && !/^https:\/\/\S+$/.test(v.onlineUrl)) return t('Use a link starting with https://');
    return null;
  }

  async function submit() {
    const p = problem();
    if (p) { setError(p); return; }
    setBusy(true); setError(null);
    try {
      const r = id ? await updateCelebration(id, v) : await createCelebration(v);
      onSaved(r.celebration);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Could not save'));
    } finally {
      setBusy(false);
    }
  }

  const design = (delta: number) => set('designIndex', (v.designIndex + delta + 250) % 250);

  return (
    <View style={{ gap: 16 }}>
      <Section title={t('What are you celebrating?')}>
        <Field label={t('Name of the celebration')} value={v.title} onChangeText={(x) => set('title', x)} placeholder={t('e.g. Asha turns 30')} maxLength={100} />
        <Text style={s.label}>{t('Occasion')}</Text>
        {OCCASION_GROUPS.map((g) => (
          <View key={g.id} style={{ gap: 6 }}>
            <Text style={s.groupLabel}>{t(g.label)}</Text>
            <View style={s.wrap}>
              {g.ids.map((oid) => (
                <Chip key={oid} label={t(OCCASION_LABELS[oid])} selected={v.occasion === oid} onPress={() => set('occasion', oid)} />
              ))}
            </View>
          </View>
        ))}
        <Field label={t('Who it’s for (optional)')} value={v.honoree} onChangeText={(x) => set('honoree', x)} placeholder={t('e.g. Asha')} maxLength={80} />
        <Text style={s.label}>{t('Card design')}</Text>
        <View style={s.rowBetween}>
          <Chip label="‹" onPress={() => design(-1)} />
          <Text style={s.muted}>{t('Design {n} of 250', { n: v.designIndex + 1 })}</Text>
          <Chip label="›" onPress={() => design(1)} />
        </View>
        <Image source={{ uri: absUrl(designArt(v.occasion, v.designIndex)) }} style={s.art} resizeMode="cover" accessibilityLabel={t('Card design')} />
        <Field
          label={t('Message to guests (optional)')} value={v.description} onChangeText={(x) => set('description', x)} maxLength={2000} multiline
          placeholder={t('Dress code, parking, what to bring, a surprise to keep quiet about…')} style={[shared.input, s.multi]}
        />
      </Section>

      <Section title={t('When and where')}>
        <Field label={t('Date')} value={v.date} onChangeText={(x) => set('date', x)} placeholder="YYYY-MM-DD" hint={t('Use the format YYYY-MM-DD')} autoCapitalize="none" />
        <View style={s.rowGap}>
          <View style={{ flex: 1 }}><Field label={t('Starts')} value={v.time} onChangeText={(x) => set('time', x)} placeholder="18:00" hint={t('24-hour, e.g. 18:00')} autoCapitalize="none" /></View>
          <View style={{ flex: 1 }}><Field label={t('Ends (optional)')} value={v.endTime} onChangeText={(x) => set('endTime', x)} placeholder="22:00" autoCapitalize="none" /></View>
        </View>
        <Field label={t('Venue')} value={v.place} onChangeText={(x) => set('place', x)} placeholder={t('e.g. The Garden Room')} maxLength={120} />
        <Field label={t('Address')} value={v.address} onChangeText={(x) => set('address', x)} placeholder={t('Street, town')} maxLength={300} />
        <Field label={t('Video call link (optional)')} value={v.onlineUrl} onChangeText={(x) => set('onlineUrl', x.trim())} placeholder={t('https://meet.google.com/…')} autoCapitalize="none" keyboardType="url" />
        <Field label={t('Time zone')} value={v.timezone} onChangeText={(x) => set('timezone', x)} autoCapitalize="none" />
      </Section>

      <Section title={t('Who can see it')}>
        <View style={{ gap: 8 }} accessibilityRole="radiogroup">
          {VISIBILITY.map(([k, label, sub]) => {
            const on = v.visibility === k;
            return (
              <Pressable key={k} onPress={() => set('visibility', k)} accessibilityRole="radio" accessibilityState={{ checked: on }} style={[s.option, on && s.optionOn]}>
                <View style={[s.radio, on && s.radioOn]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.bold}>{t(label)}</Text>
                  <Text style={s.muted}>{t(sub)}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section title={t('Replies and guests')}>
        <Toggle label={t('Ask guests if they can come (RSVP)')} value={v.rsvpEnabled} onChange={(x) => set('rsvpEnabled', x)} />
        {v.rsvpEnabled && (
          <View style={{ gap: 12 }}>
            <Field label={t('Reply by (optional)')} value={v.rsvpDeadline} onChangeText={(x) => set('rsvpDeadline', x)} placeholder="YYYY-MM-DD" autoCapitalize="none" />
            <Text style={s.label}>{t('People per invitation')}</Text>
            <View style={s.wrap}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <Chip key={n} label={n === 1 ? t('Just the guest') : t('Guest + up to {n}', { n: n - 1 })} selected={v.maxPartySize === n} onPress={() => set('maxPartySize', n)} />
              ))}
            </View>
            <Toggle label={t('Ask about dietary needs')} value={v.askDiet} onChange={(x) => set('askDiet', x)} />
            <Toggle label={t('Ask about accessibility needs')} value={v.askAccess} onChange={(x) => set('askAccess', x)} />
            <Toggle label={t('Show who’s coming to other guests')} value={v.showGuestList} onChange={(x) => set('showGuestList', x)} />
          </View>
        )}
        <Toggle label={t('Guests can leave messages, photos and videos')} value={v.guestPosts} onChange={(x) => set('guestPosts', x)} />
        {v.guestPosts && <Toggle label={t('I approve messages before they appear')} value={v.moderatePosts} onChange={(x) => set('moderatePosts', x)} />}
        {wishlists.length > 0 && (
          <View style={{ gap: 6 }}>
            <Text style={s.label}>{t('Gift wishlist (optional)')}</Text>
            <View style={s.wrap}>
              <Chip label={t('No wishlist')} selected={v.wishlistId === ''} onPress={() => set('wishlistId', '')} />
              {wishlists.map((w) => <Chip key={w.id} label={w.title} selected={v.wishlistId === w.id} onPress={() => set('wishlistId', w.id)} />)}
            </View>
          </View>
        )}
      </Section>

      <ErrorText>{error}</ErrorText>
      <Button label={id ? t('Save changes') : t('Create celebration page')} onPress={submit} busy={busy} />
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

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={s.toggle}>
      <Text style={[s.bold, { flex: 1 }]}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.brand, false: colors.line }} />
    </View>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 14, color: colors.muted },
  groupLabel: { fontSize: 13, fontWeight: '600', color: colors.muted, marginTop: 4 },
  muted: { fontSize: 14, color: colors.muted },
  bold: { fontSize: 15, fontWeight: '600', color: colors.text },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  rowGap: { flexDirection: 'row', gap: 8 },
  multi: { minHeight: 90, textAlignVertical: 'top' },
  art: { width: 160, height: 200, borderRadius: 12, alignSelf: 'center' },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontSize: 14, color: colors.text },
  chipTextOn: { color: '#fff' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.line },
  optionOn: { borderColor: colors.brand },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.muted },
  radioOn: { borderColor: colors.brand, backgroundColor: colors.brand },
});
