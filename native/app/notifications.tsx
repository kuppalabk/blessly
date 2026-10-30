import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { deviceLanguage, t } from '../src/i18n';
import { Button, ErrorText, Loading, Screen, Title, colors } from '../src/ui';
import { listNotifications, markAllRead, type Notification } from '../src/api/notifications';
import { errorMessage, openLink } from '../src/api/family';

const when = (iso: string) =>
  new Intl.DateTimeFormat(deviceLanguage(), { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

export default function NotificationsScreen() {
  const [list, setList] = useState<Notification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    listNotifications()
      .then((r) => { setList(r.notifications); setError(null); })
      .catch((e) => setError(errorMessage(e, t('Could not load alerts.'))));
  }, []);
  useFocusEffect(load);

  const unread = list?.some((n) => !n.readAt) ?? false;

  async function readAll() {
    setBusy(true);
    setError(null);
    try {
      await markAllRead();
      load();
    } catch (e) {
      setError(errorMessage(e, t('Something went wrong')));
    }
    setBusy(false);
  }

  return (
    <Screen>
      <Title>{t('Alerts')}</Title>
      {unread ? <Button label={t('Mark all as read')} variant="secondary" busy={busy} onPress={readAll} /> : null}
      {list === null && !error ? <Loading /> : null}
      {list !== null ? (
        <View style={styles.card}>
          {list.length === 0 ? <Text style={styles.empty}>{t('No alerts yet. Reminders appear here before each occasion.')}</Text> : null}
          {list.map((n) => {
            const isNew = !n.readAt;
            return (
              <Pressable key={n.id} accessibilityRole="button" onPress={() => openLink(n.link ?? '/home')} style={[styles.item, isNew && styles.itemNew]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{n.title}</Text>
                  <Text style={styles.muted}>{`${n.body} · ${when(n.createdAt)}`}</Text>
                </View>
                {isNew ? <Text style={styles.newBadge}>{t('New')}</Text> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: 14 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  itemNew: { backgroundColor: '#F8F6FF' },
  itemTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  muted: { fontSize: 14, color: colors.muted, marginTop: 2 },
  newBadge: { fontSize: 12, fontWeight: '600', color: '#fff', backgroundColor: colors.brand, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
  empty: { padding: 24, textAlign: 'center', color: colors.muted },
});
