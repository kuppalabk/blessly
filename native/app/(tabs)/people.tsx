import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { formatCalDate, listPeople, type PersonView } from '../../src/api/people';
import { Button, Empty, ErrorText, Field, Loading, Row, Title, colors } from '../../src/ui';
import { t } from '../../src/i18n';

function daysLabel(days: number) {
  return days === 0 ? t('Today') : days === 1 ? t('Tomorrow') : t('{days} days', { days });
}

function subtitle(p: PersonView) {
  const next = p.nextOccasion ? `${t(p.nextOccasion.label)} · ${formatCalDate(p.nextOccasion.next)}` : t('No dates yet');
  return `${t(p.relationship)} · ${next}`;
}

export default function PeopleScreen() {
  const [list, setList] = useState<PersonView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    listPeople()
      .then((r) => { setList(r.people); setError(null); })
      .catch(() => setError(t('Could not load people.')))
      .finally(() => setRefreshing(false));
  }, []);

  // Reload whenever the tab is shown, so edits made on a person's screen appear here.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (list ?? []).filter((p) => `${p.name} ${p.relationship}`.toLowerCase().includes(needle));
  }, [list, q]);

  return (
    <FlatList
      style={styles.page}
      contentContainerStyle={styles.content}
      data={shown}
      keyExtractor={(p) => p.id}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <Title>{t('People')}</Title>
          <Button label={t('Add person')} onPress={() => router.push('/people/new')} />
          {list && list.length > 0 && (
            <Field label={t('Search people')} value={q} onChangeText={setQ} placeholder={t('Search {length} people', { length: list.length })} autoCorrect={false} />
          )}
        </View>
      }
      ListEmptyComponent={
        error ? <ErrorText>{error}</ErrorText>
          : list === null ? <Loading />
          : list.length === 0 ? (
            <View style={styles.header}>
              <Empty text={t('No one here yet. Add family, friends and colleagues with their birthdays and anniversaries.')} />
              <Button label={t('Add your first person')} onPress={() => router.push('/people/new')} />
            </View>
          ) : <Empty text={t('No one matches “{q}”.', { q })} />
      }
      renderItem={({ item }) => {
        const days = item.nextOccasion?.daysAway ?? null;
        const shared = !item.isMine && item.ownerName ? t('Shared by {sharedBy}', { sharedBy: item.ownerName }) : item.familyId ? t('Shared with family') : null;
        return (
          <View style={styles.card}>
            <Row
              title={item.name}
              subtitle={shared ? `${subtitle(item)}\n${shared}` : subtitle(item)}
              onPress={() => router.push(`/people/${item.id}`)}
              right={days !== null ? (
                <View style={[styles.badge, days <= 1 && styles.badgeHot]}>
                  <Text style={[styles.badgeText, days <= 1 && styles.badgeTextHot]}>{daysLabel(days)}</Text>
                </View>
              ) : undefined}
            />
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.page },
  content: { padding: 16, gap: 8 },
  header: { gap: 12, marginBottom: 8 },
  card: { backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: 14 },
  badge: { backgroundColor: colors.page, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeHot: { backgroundColor: '#fde7ea' },
  badgeText: { fontSize: 13, fontWeight: '600', color: colors.brand },
  badgeTextHot: { color: colors.danger },
});
