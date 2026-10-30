import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { me } from '../../src/api/endpoints';
import { LANGUAGES } from '../../src/api/account';
import { OCCASIONS, OCCASION_GROUPS, createCard, deleteCard, duplicateCard, listCards, occasionLabel, updateCard, type CardSummary } from '../../src/api/designs';
import { t } from '../../src/i18n';
import { Button, Empty, ErrorText, Loading, Screen, Section, Title, colors } from '../../src/ui';

export default function DesignsScreen() {
  const [cards, setCards] = useState<CardSummary[] | null>(null);
  const [firstName, setFirstName] = useState('');
  const [language, setLanguage] = useState('en');
  const [occasion, setOccasion] = useState('birthday');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    me().then(({ user }) => {
      setFirstName(user.name.split(' ')[0]);
      setLanguage(user.language ?? 'en');
    }).catch(() => undefined);
    listCards().then((r) => setCards(r.designs)).catch((e) => setError(e instanceof Error ? e.message : t('Could not load cards')));
  }, []);
  useFocusEffect(load);

  async function create() {
    setBusy('new');
    setError(null);
    try {
      const { design } = await createCard({
        occasion,
        designIndex: Math.floor(Math.random() * 250),
        language: LANGUAGES.some((l) => l.code === language) ? language : 'en',
        from: firstName || undefined
      });
      router.push(`/designs/${design.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Could not start a card'));
    } finally {
      setBusy(null);
    }
  }

  async function act(id: string, what: 'fav' | 'copy' | 'delete') {
    if (what === 'copy') {
      setBusy(id);
      setError(null);
      try {
        const { design } = await duplicateCard(id);
        router.push(`/designs/${design.id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : t('Something went wrong'));
      } finally {
        setBusy(null);
      }
      return;
    }
    if (what === 'delete') {
      Alert.alert(t('Delete this card? Wishes you already sent with it will show their original design.'), undefined, [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Delete'), style: 'destructive', onPress: async () => {
            setBusy(id);
            try {
              await deleteCard(id);
              setCards((xs) => (xs ?? []).filter((x) => x.id !== id));
            } catch (e) {
              setError(e instanceof Error ? e.message : t('Something went wrong'));
            } finally {
              setBusy(null);
            }
          }
        }
      ]);
      return;
    }
    const card = cards?.find((x) => x.id === id);
    if (!card) return;
    setBusy(id);
    setError(null);
    try {
      await updateCard(id, { favourite: !card.favourite });
      setCards((xs) => (xs ?? []).map((x) => (x.id === id ? { ...x, favourite: !x.favourite } : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Something went wrong'));
    } finally {
      setBusy(null);
    }
  }

  if (!cards) return error ? <Screen><ErrorText>{error}</ErrorText></Screen> : <Loading />;

  const favs = cards.filter((c) => c.favourite);
  const rest = cards.filter((c) => !c.favourite);

  const grid = (xs: CardSummary[]) => (
    <View style={styles.grid}>
      {xs.map((d) => (
        <View key={d.id} style={styles.tile}>
          <Pressable accessibilityRole="button" accessibilityLabel={d.title} onPress={() => router.push(`/designs/${d.id}`)}>
            {d.frontUrl ? (
              <Image source={{ uri: d.frontUrl }} style={styles.thumb} resizeMode="cover" accessibilityLabel={d.title} />
            ) : (
              <View style={[styles.thumb, styles.placeholder]}>
                <Text style={styles.placeholderText} numberOfLines={3}>{d.title}</Text>
              </View>
            )}
            <Text style={styles.tileTitle} numberOfLines={2}>{d.title}</Text>
          </Pressable>
          <Text style={styles.muted}>
            {t(occasionLabel(d.occasion))} · {new Date(d.updatedAt).toLocaleDateString()}
          </Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={d.favourite ? t('Unfavourite {title}', { title: d.title }) : t('Favourite {title}', { title: d.title })}
              disabled={busy === d.id}
              onPress={() => act(d.id, 'fav')}
              style={styles.action}
            >
              <Text style={styles.star}>{d.favourite ? '★' : '☆'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={t('Duplicate {title}', { title: d.title })} disabled={busy === d.id} onPress={() => act(d.id, 'copy')} style={styles.action}>
              <Text style={styles.actionText}>{t('Copy')}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={t('Delete {title}', { title: d.title })} disabled={busy === d.id} onPress={() => act(d.id, 'delete')} style={styles.action}>
              <Text style={[styles.actionText, { color: colors.danger }]}>{t('Delete')}</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );

  return (
    <Screen>
      <View style={{ gap: 6 }}>
        <Title>{t('My cards')}</Title>
        <Text style={styles.muted}>
          {t('Design your own card: change the words, fonts and colours, add photos, stickers, a signature or a QR code — then send it with a wish or print it.')}
        </Text>
      </View>

      <Section title={t('Start a new card')}>
        <Text style={styles.label}>{t('Occasion')}</Text>
        {OCCASION_GROUPS.map((g) => (
          <View key={g.id} style={{ gap: 6 }}>
            <Text style={styles.groupLabel}>{t(g.label)}</Text>
            <View style={styles.chips}>
              {g.ids.map((id) => {
                const label = OCCASIONS.find((o) => o.id === id)?.label ?? id;
                const on = occasion === id;
                return (
                  <Pressable key={id} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setOccasion(id)} style={[styles.chip, on && styles.chipOn]}>
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{t(label)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
        <Button label={t('Start a new card')} busy={busy === 'new'} onPress={create} />
      </Section>

      <ErrorText>{error}</ErrorText>

      {favs.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={styles.h2}>{t('Favourites')}</Text>
          {grid(favs)}
        </View>
      )}
      <View style={{ gap: 8 }}>
        <Text style={styles.h2}>{favs.length ? t('Other cards') : t('Your cards')}</Text>
        {rest.length ? grid(rest) : (
          <Empty text={favs.length ? t('No other cards.') : t('No cards yet. Start one above, or pick a design in Create and tap “Customise this design”.')} />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  label: { fontSize: 14, color: colors.muted },
  groupLabel: { fontSize: 13, color: colors.muted, marginTop: 4 },
  h2: { fontSize: 18, fontWeight: '700', color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: colors.page },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontSize: 14, color: colors.text },
  chipTextOn: { color: '#fff', fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  tile: { width: '47%', gap: 4 },
  thumb: { width: '100%', aspectRatio: 0.75, borderRadius: 10, backgroundColor: colors.surface },
  placeholder: { backgroundColor: '#efeafc', alignItems: 'center', justifyContent: 'center', padding: 10 },
  placeholderText: { color: colors.brand, fontWeight: '600', textAlign: 'center' },
  tileTitle: { fontSize: 14, fontWeight: '600', color: colors.text, marginTop: 6 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  action: { paddingVertical: 6, paddingHorizontal: 6 },
  star: { fontSize: 18, color: colors.brand },
  actionText: { fontSize: 13, color: colors.brand, fontWeight: '600' },
});
