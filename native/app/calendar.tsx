import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { deviceLanguage, t } from '../src/i18n';
import { ErrorText, Loading, Screen, Title, colors } from '../src/ui';
import { daysInMonth, formatCalDate, todayLocal, upcomingItems, type UpcomingItem } from '../src/api/calendar';
import { errorMessage, openLink } from '../src/api/family';

const COLOR = { person: colors.brand, festival: '#d9822b', event: '#1f7a4d' } as const;
const LEGEND: { label: string; color: string }[] = [
  { label: 'Your people', color: COLOR.person },
  { label: 'Festivals', color: COLOR.festival },
  { label: 'Family events', color: COLOR.event },
];

export default function CalendarScreen() {
  const today = todayLocal();
  const [ym, setYm] = useState({ y: today.y, m: today.m });
  const [items, setItems] = useState<UpcomingItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      upcomingItems()
        .then((r) => { setItems(r.items); setError(null); })
        .catch((e) => setError(errorMessage(e, t('Could not load your events.'))));
    }, []),
  );

  const { y, m } = ym;
  const lang = deviceLanguage();
  const monthItems = (items ?? []).filter((i) => i.date.y === y && i.date.m === m);
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // Monday-first grid
  const dim = daysInMonth(y, m);
  const title = new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
  const weekdays = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(lang, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + i))));
  const cells: (number | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: dim }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  function shift(delta: number) {
    setYm((prev) => {
      const idx = prev.y * 12 + (prev.m - 1) + delta;
      return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
    });
  }

  return (
    <Screen>
      <View style={styles.nav}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('Previous month')} onPress={() => shift(-1)} style={styles.navBtn}>
          <Text style={styles.navText}>‹</Text>
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Title>{title}</Title>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t('Next month')} onPress={() => shift(1)} style={styles.navBtn}>
          <Text style={styles.navText}>›</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <View style={styles.grid}>
          {weekdays.map((d, i) => <Text key={i} style={styles.weekday}>{d}</Text>)}
        </View>
        <View style={styles.grid}>
          {cells.map((d, idx) => {
            if (d === null) return <View key={`b${idx}`} style={styles.cell} />;
            const evs = monthItems.filter((it) => it.date.d === d);
            const isToday = today.y === y && today.m === m && today.d === d;
            const label = `${d} ${title}${evs.length ? `: ${evs.map((e) => e.title).join(', ')}` : ''}`;
            return (
              <View key={d} accessible accessibilityLabel={label} style={[styles.cell, isToday && styles.today]}>
                <Text style={[styles.dayNum, evs.length > 0 && styles.dayBusy]}>{d}</Text>
                <View style={styles.dots}>
                  {evs.slice(0, 3).map((e) => <View key={e.key} style={[styles.dot, { backgroundColor: COLOR[e.type] }]} />)}
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.legend}>
        {LEGEND.map((l) => (
          <View key={l.label} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: l.color }]} />
            <Text style={styles.muted}>{t(l.label)}</Text>
          </View>
        ))}
      </View>

      {items === null && !error ? <Loading /> : null}
      <ErrorText>{error}</ErrorText>

      <View style={styles.card}>
        {items !== null && monthItems.length === 0 ? <Text style={styles.muted}>{t('Nothing this month.')}</Text> : null}
        {monthItems.map((i) => (
          <Pressable key={i.key} accessibilityRole="button" onPress={() => openLink(i.href)} style={styles.item}>
            <View style={[styles.bar, { backgroundColor: COLOR[i.type] }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{i.title}</Text>
              <Text style={styles.muted}>
                {`${i.type === 'event' ? `${i.subtitle} · ` : ''}${formatCalDate(i.date)}${i.approximate ? t(' · date may vary') : ''}`}
              </Text>
            </View>
            <Text style={styles.badge}>{i.type === 'event' ? t('Event') : t('Wish')}</Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  navText: { fontSize: 24, color: colors.brand },
  card: { backgroundColor: colors.surface, borderRadius: 14, padding: 12, gap: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: '14.2857%', textAlign: 'center', fontSize: 12, fontWeight: '700', color: colors.muted, paddingBottom: 6 },
  cell: { width: '14.2857%', minHeight: 50, alignItems: 'center', paddingVertical: 4, gap: 4, borderRadius: 10, borderWidth: 1, borderColor: 'transparent' },
  today: { borderColor: colors.brand },
  dayNum: { fontSize: 14, fontWeight: '500', color: colors.text },
  dayBusy: { fontWeight: '700' },
  dots: { flexDirection: 'row', gap: 2, height: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  muted: { fontSize: 14, color: colors.muted },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  bar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  itemTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  badge: { fontSize: 12, fontWeight: '600', color: colors.muted, backgroundColor: colors.page, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
});
