import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { upcoming, type UpcomingItem } from '../../src/api/endpoints';
import { t } from '../../src/i18n';

export default function HomeScreen() {
  const [items, setItems] = useState<UpcomingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    upcoming()
      .then((r) => setItems(r.items))
      .catch(() => setError(t('Could not load your events.')))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  return (
    <FlatList
      style={styles.list}
      data={items}
      keyExtractor={(i) => i.id}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      ListEmptyComponent={<Text style={styles.empty}>{error ?? t('Nothing coming up yet.')}</Text>}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.sub}>{item.daysAway === 0 ? t('Today') : t('In {n} days', { n: item.daysAway })}</Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { backgroundColor: '#fff' },
  row: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ddd' },
  title: { fontSize: 16, fontWeight: '600' },
  sub: { fontSize: 14, color: '#666', marginTop: 4 },
  empty: { padding: 24, textAlign: 'center', color: '#666' },
});
