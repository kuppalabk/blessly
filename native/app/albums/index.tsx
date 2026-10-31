import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import { Button, ErrorText, Field, Loading, Empty, Screen, Section, colors } from '../../src/ui';
import { t } from '../../src/i18n';
import { OCCASION_GROUPS, OCCASION_LABELS, absUrl } from '../../src/api/celebrations';
import { createAlbum, listAlbums, listEditableFamilies, type AlbumListItem, type FamilyChoice } from '../../src/api/albums';

export default function AlbumsScreen() {
  const [list, setList] = useState<AlbumListItem[] | null>(null);
  const [families, setFamilies] = useState<FamilyChoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [occasion, setOccasion] = useState('birthday');
  const [familyId, setFamilyId] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      listAlbums()
        .then((r) => { setList(r.albums); setError(null); })
        .catch(() => setError(t('Could not load albums.')));
    }, []),
  );

  useEffect(() => {
    listEditableFamilies().then((r) => setFamilies(r.families)).catch(() => setFamilies([]));
  }, []);

  async function create() {
    setBusy(true); setFormError(null);
    try {
      const r = await createAlbum({ title, occasion, familyId });
      router.push(`/albums/${r.album.id}`);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : t('Could not create'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t('Albums') }} />
      <ErrorText>{error}</ErrorText>
      {list === null && !error ? <Loading /> : null}
      {list !== null && list.length === 0 ? (
        <Text style={s.muted}>
          {t('Collect the photos from a birthday, wedding or Diwali in one album, pick one of 100 designs and share it with family — they can add their photos too.')}
        </Text>
      ) : null}

      {list?.map((a) => (
        <Pressable key={a.id} onPress={() => router.push(`/albums/${a.id}`)} accessibilityRole="button" style={s.card}>
          {a.coverUrl ? (
            <Image source={{ uri: absUrl(a.coverUrl) }} style={s.cover} resizeMode="cover" accessibilityLabel={t('Cover of {title}', { title: a.title })} />
          ) : (
            <View style={[s.cover, s.coverEmpty]}><Text style={s.muted}>{t('No photos yet')}</Text></View>
          )}
          <View style={s.cardBody}>
            <Text style={s.bold}>{a.title}</Text>
            <Text style={s.muted}>
              {a.photoCount === 1 ? t('{n} photo', { n: 1 }) : t('{n} photos', { n: a.photoCount })}
              {a.familyName ? ` · ${a.familyName}` : ''}
              {!a.isMine ? t(' · by {ownerName}', { ownerName: a.ownerName }) : ''}
              {a.slug ? t(' · shared') : ''}
            </Text>
          </View>
        </Pressable>
      ))}

      <Section title={t('New album')}>
        <Field label={t('Album name')} value={title} onChangeText={setTitle} placeholder={t('e.g. Dadi’s 80th birthday')} maxLength={80} />
        <Text style={s.label}>{t('Occasion')}</Text>
        {OCCASION_GROUPS.map((g) => (
          <View key={g.id} style={{ gap: 6 }}>
            <Text style={s.groupLabel}>{t(g.label)}</Text>
            <View style={s.wrap}>
              {g.ids.map((oid) => <Chip key={oid} label={t(OCCASION_LABELS[oid])} selected={occasion === oid} onPress={() => setOccasion(oid)} />)}
            </View>
          </View>
        ))}
        {families.length > 0 && (
          <>
            <Text style={s.label}>{t('Share with family')}</Text>
            <View style={s.wrap}>
              <Chip label={t('Only me')} selected={familyId === ''} onPress={() => setFamilyId('')} />
              {families.map((f) => <Chip key={f.id} label={f.name} selected={familyId === f.id} onPress={() => setFamilyId(f.id)} />)}
            </View>
          </>
        )}
        <ErrorText>{formError}</ErrorText>
        <Button label={t('Create album')} onPress={create} busy={busy} />
      </Section>
    </Screen>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!selected }} style={[s.chip, selected && s.chipOn]}>
      <Text style={[s.chipText, selected && s.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  muted: { fontSize: 14, color: colors.muted },
  label: { fontSize: 14, color: colors.muted },
  groupLabel: { fontSize: 13, fontWeight: '600', color: colors.muted, marginTop: 4 },
  bold: { fontSize: 16, fontWeight: '600', color: colors.text },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: { backgroundColor: colors.surface, borderRadius: 14, overflow: 'hidden' },
  cover: { width: '100%', aspectRatio: 4 / 3 },
  coverEmpty: { backgroundColor: colors.page, alignItems: 'center', justifyContent: 'center' },
  cardBody: { padding: 12, gap: 2 },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontSize: 14, color: colors.text },
  chipTextOn: { color: '#fff' },
});
