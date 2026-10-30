import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { addDaysCal, deletePerson, formatCalDate, getPerson, listFamilies, type FamilyOption, type OccasionView, type PersonView } from '../../src/api/people';
import { LANGUAGES } from '../../src/api/wishes';
import { Button, ErrorText, Loading, Screen, Section, colors } from '../../src/ui';
import { t } from '../../src/i18n';

// Reminder stages, same as the website (lib/reminders).
const STAGES = [
  { key: 'remindGift', daysBefore: 7, hour: 9, title: 'Gift reminder' },
  { key: 'remindIdeas', daysBefore: 3, hour: 9, title: 'Gift ideas' },
  { key: 'remindDraft', daysBefore: 1, hour: 18, title: 'Wish drafted' },
  { key: 'remindDay', daysBefore: 0, hour: 9, title: 'Send today' },
] as const;

// The wish occasion that suits each kind of date.
const CARD_FOR: Record<string, string> = { birthday: 'birthday', anniversary: 'anniversary', work_anniversary: 'newjob', custom: 'birthday' };

function reminderDays(o: OccasionView) {
  return STAGES.filter((s) => o[s.key]);
}

export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [p, setP] = useState<PersonView | null>(null);
  const [families, setFamilies] = useState<FamilyOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getPerson(id)
      .then((r) => { setP(r.person); setError(null); })
      .catch((e) => setError(e instanceof Error ? e.message : t('Could not load this person.')));
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { listFamilies().then((r) => setFamilies(r.families)).catch(() => undefined); }, []);

  function confirmDelete() {
    if (!p) return;
    Alert.alert(t('Confirm delete'), t('Delete {name} and all their reminders? This can’t be undone.', { name: p.name }), [
      { text: t('Cancel'), style: 'cancel' },
      {
        text: t('Yes, delete'),
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await deletePerson(p.id);
            router.replace('/people');
          } catch (e) {
            setError(e instanceof Error ? e.message : t('Could not delete.'));
            setBusy(false);
          }
        },
      },
    ]);
  }

  const back = (
    <Pressable accessibilityRole="button" accessibilityLabel={t('Back to people')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/people'))} style={styles.back}>
      <Text style={styles.backText}>‹</Text>
    </Pressable>
  );

  if (!p) {
    return (
      <Screen scroll={false}>
        <View style={styles.topRow}>{back}</View>
        {error ? <ErrorText>{error}</ErrorText> : <Loading />}
      </Screen>
    );
  }

  const next = p.nextOccasion;
  const circle = p.familyId ? families.find((f) => f.id === p.familyId) : undefined;
  const circleName = circle?.name ?? t('a family circle');
  const firstName = p.name.split(' ')[0];
  const language = LANGUAGES.find((l) => l.code === p.language)?.label ?? 'English';

  return (
    <Screen>
      <View style={styles.topRow}>
        {back}
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>{p.name}</Text>
          <Text style={styles.sub}>{`${t(p.relationship)} · ${t('wishes in {language}', { language })}`}</Text>
        </View>
        {p.isMine && <Button label={t('Edit')} variant="secondary" onPress={() => router.push(`/people/${p.id}/edit`)} />}
      </View>

      {p.familyId && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            {p.isMine
              ? `${t('Shared with')} ${circleName} ${t('— everyone there gets these reminders.')}`
              : `${t('Shared by')} ${p.ownerName ?? ''} ${t('in')} ${circleName}${t('. Only')} ${p.ownerName?.split(' ')[0] ?? ''} ${t('can edit.')}`}
          </Text>
        </View>
      )}

      {next && (
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>
            {`${next.daysAway === 0 ? t('Today') : t('In {daysAway} days', { daysAway: next.daysAway })} · ${formatCalDate(next.next, { weekday: 'long', day: 'numeric', month: 'long' })}`}
          </Text>
          <Text style={styles.heroTitle}>{t(next.label)}</Text>
          <Button
            label={`${t('Write a wish for')} ${firstName}`}
            variant="secondary"
            onPress={() => router.push(`/create?person=${p.id}&occasion=${CARD_FOR[next.kind] ?? 'birthday'}`)}
          />
        </View>
      )}

      <Section title={t('Occasions and reminders')}>
        {p.occasions.length === 0 && (
          <Text style={styles.muted}>
            {t('No dates yet.')}{p.isMine ? ` ${t('Add a birthday or anniversary')}.` : ''}
          </Text>
        )}
        {p.occasions.map((o) => (
          <View key={o.id} style={styles.occasion}>
            <View style={styles.occasionHead}>
              <Text style={styles.occasionTitle}>{t(o.label)}</Text>
              <Text style={styles.badge}>{formatCalDate(o.next, { day: 'numeric', month: 'long' })}</Text>
            </View>
            {reminderDays(o).map((s) => (
              <View key={s.key} style={styles.reminder}>
                <Text style={[styles.muted, { flex: 1 }]}>{t(s.title)}</Text>
                <Text style={styles.muted}>{`${formatCalDate(addDaysCal(o.next, -s.daysBefore))} · ${String(s.hour).padStart(2, '0')}:00`}</Text>
              </View>
            ))}
          </View>
        ))}
      </Section>

      {(p.phone || p.email || p.notes) && (
        <Section>
          {p.phone ? <Text style={styles.line}><Text style={styles.muted}>{t('Mobile')}</Text>{` · ${p.phone}`}</Text> : null}
          {p.email ? <Text style={styles.line}><Text style={styles.muted}>{t('Email')}</Text>{` · ${p.email}`}</Text> : null}
          {p.notes ? <Text style={styles.line}><Text style={styles.muted}>{t('Notes')}</Text>{` · ${p.notes}`}</Text> : null}
        </Section>
      )}

      {p.isMine && (
        <Button label={t('Delete {name}', { name: p.name })} variant="danger" busy={busy} onPress={confirmDelete} />
      )}
      {error && <ErrorText>{error}</ErrorText>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  backText: { fontSize: 28, color: colors.brand, marginTop: -4 },
  h1: { fontSize: 24, fontWeight: '700', color: colors.text },
  sub: { fontSize: 14, color: colors.muted, marginTop: 2 },
  notice: { backgroundColor: colors.surface, borderRadius: 14, padding: 14 },
  noticeText: { fontSize: 14, color: colors.text },
  hero: { backgroundColor: colors.brand, borderRadius: 16, padding: 16, gap: 10 },
  eyebrow: { color: '#F4B98F', fontSize: 14, fontWeight: '600' },
  heroTitle: { color: '#fff', fontSize: 22, fontWeight: '700', textTransform: 'capitalize' },
  muted: { fontSize: 14, color: colors.muted },
  line: { fontSize: 15, color: colors.text },
  occasion: { backgroundColor: colors.page, borderRadius: 12, padding: 12, gap: 6 },
  occasionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  occasionTitle: { fontSize: 16, fontWeight: '700', color: colors.text, textTransform: 'capitalize', flexShrink: 1 },
  badge: { fontSize: 13, fontWeight: '600', color: colors.brand, backgroundColor: colors.surface, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, overflow: 'hidden' },
  reminder: { flexDirection: 'row', gap: 8, alignItems: 'center' },
});
