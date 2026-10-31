import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import { Button, ErrorText, Field, Loading, Empty, Row, Screen, Section, colors } from '../../src/ui';
import { t } from '../../src/i18n';
import { createWishlist, listWishlists, type WishlistListItem } from '../../src/api/wishlists';
import { OCCASION_GROUPS, OCCASION_LABELS } from '../../src/api/celebrations';

const countLabel = (n: number) => (n === 1 ? t('{n} item', { n }) : t('{n} items', { n }));

export default function WishlistsScreen() {
  const [list, setList] = useState<WishlistListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [occasion, setOccasion] = useState('birthday');
  const [eventDate, setEventDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      listWishlists()
        .then((r) => { setList(r.wishlists); setError(null); })
        .catch(() => setError(t('Could not load wishlists.')));
    }, []),
  );

  async function create() {
    if (title.trim().length < 2) { setFormError(t('Give your list a name')); return; }
    if (eventDate && !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) { setFormError(t('Use the date format YYYY-MM-DD')); return; }
    setBusy(true); setFormError(null);
    try {
      const r = await createWishlist({ title, occasion, eventDate });
      router.push(`/wishlists/${r.wishlist.id}`);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : t('Could not create'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t('Wishlists') }} />
      <Text style={s.muted}>
        {t('Gift lists and registries for birthdays, weddings, babies and housewarmings. Friends reserve what they’ll buy, so nothing is doubled up — and it stays a surprise.')}
      </Text>

      <ErrorText>{error}</ErrorText>
      {list === null && !error ? <Loading /> : null}
      {list !== null && list.length === 0 ? <Empty text={t('No wishlists yet.')} /> : null}
      {list && list.length > 0 && (
        <Section>
          {list.map((w) => (
            <Row
              key={w.id}
              title={w.title}
              subtitle={[t(OCCASION_LABELS[w.occasion] ?? w.occasion), countLabel(w.items), w.eventDate ? formatDate(w.eventDate) : null].filter(Boolean).join(' · ')}
              onPress={() => router.push(`/wishlists/${w.id}`)}
            />
          ))}
        </Section>
      )}

      <Section title={t('Start a wishlist')}>
        <Field label={t('Name')} value={title} onChangeText={setTitle} placeholder={t('e.g. Our wedding registry')} maxLength={100} />
        <Text style={s.label}>{t('Occasion')}</Text>
        {OCCASION_GROUPS.map((g) => (
          <View key={g.id} style={{ gap: 6 }}>
            <Text style={s.groupLabel}>{t(g.label)}</Text>
            <View style={s.wrap}>
              {g.ids.map((oid) => (
                <Pressable key={oid} onPress={() => setOccasion(oid)} accessibilityRole="button" accessibilityState={{ selected: occasion === oid }} style={[s.chip, occasion === oid && s.chipOn]}>
                  <Text style={[s.chipText, occasion === oid && s.chipTextOn]}>{t(OCCASION_LABELS[oid])}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}
        <Field label={t('Date (optional)')} value={eventDate} onChangeText={setEventDate} placeholder="YYYY-MM-DD" autoCapitalize="none" />
        <ErrorText>{formError}</ErrorText>
        <Button label={t('Create wishlist')} onPress={create} busy={busy} disabled={title.trim().length < 2} />
      </Section>
    </Screen>
  );
}

/** A date as the device shows it, for example "12 Dec 2026". Falls back to the raw text. */
function formatDate(iso: string) {
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

const s = StyleSheet.create({
  muted: { fontSize: 14, color: colors.muted },
  label: { fontSize: 14, color: colors.muted },
  groupLabel: { fontSize: 13, fontWeight: '600', color: colors.muted, marginTop: 4 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontSize: 14, color: colors.text },
  chipTextOn: { color: '#fff' },
});
