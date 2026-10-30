import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { listOrders, type OrderRow } from '../../src/api/money';
import { t } from '../../src/i18n';
import { Empty, ErrorText, Loading, Screen, Title, colors } from '../../src/ui';
import { TestMode } from './shop';

const STATUS: Record<string, string> = {
  paid: 'Paid', in_production: 'Printing', shipped: 'On its way', delivered: 'Delivered',
  refunded: 'Refunded', failed: 'Payment failed', cancelled: 'Cancelled'
};

export default function OrdersScreen() {
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listOrders().then((r) => setOrders(r.orders)).catch((e) => setError(e instanceof Error ? e.message : t('Could not load orders')));
  }, []);
  useFocusEffect(load);

  if (!orders) return error ? <Screen><ErrorText>{error}</ErrorText></Screen> : <Loading />;

  return (
    <Screen>
      <Title>{t('My orders')}</Title>
      <TestMode />
      {orders.length === 0 ? <Empty text={t('No orders yet.')} /> : (
        <View style={styles.list}>
          {orders.map((o) => (
            <View key={o.id} style={styles.item}>
              <Text style={{ fontSize: 24 }}>{o.kind === 'giftcard' ? '💳' : o.kind === 'print' ? '✉️' : '🛍️'}</Text>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.title}>{o.title}</Text>
                <Text style={styles.muted}>
                  {o.amount} · {new Date(o.createdAt).toLocaleDateString()}
                  {o.tracking ? t(' · tracking {tracking}', { tracking: o.tracking }) : ''}
                </Text>
              </View>
              <Text style={[styles.badge, o.status === 'delivered' && styles.badgeGreen]}>{t(STATUS[o.status] ?? o.status)}</Text>
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { backgroundColor: colors.surface, borderRadius: 14, overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  title: { fontSize: 15, fontWeight: '600', color: colors.text },
  muted: { fontSize: 13, color: colors.muted },
  badge: { fontSize: 12, color: colors.muted, borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8, overflow: 'hidden' },
  badgeGreen: { color: '#1f6b4f', borderColor: '#1f6b4f' },
});
