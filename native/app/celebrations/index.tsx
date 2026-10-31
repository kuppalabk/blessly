import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import { Button, Empty, ErrorText, Loading, Row, Screen, Section } from '../../src/ui';
import { t } from '../../src/i18n';
import { formatWhen, isPast, listCelebrations, occasionLabel, type CelebrationListItem } from '../../src/api/celebrations';

export default function CelebrationsScreen() {
  const [list, setList] = useState<CelebrationListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reload every time the screen comes back into view, so a new or changed celebration shows up.
  useFocusEffect(
    useCallback(() => {
      listCelebrations()
        .then((r) => { setList(r.celebrations); setError(null); })
        .catch(() => setError(t('Could not load celebrations.')));
    }, []),
  );

  const upcoming = list?.filter((c) => !isPast(c)) ?? [];
  const past = list?.filter((c) => isPast(c)) ?? [];

  const subtitle = (c: CelebrationListItem) =>
    `${formatWhen(c.startsAt, c.timezone)}${c.cancelledAt ? t(' · cancelled') : ''}\n${occasionLabel(c.occasion)} · ${t('{coming} coming · {guests} on the guest list', { coming: c.coming, guests: c.guests })}`;

  const rows = (xs: CelebrationListItem[]) =>
    xs.map((c) => <Row key={c.id} title={c.title} subtitle={subtitle(c)} onPress={() => router.push(`/celebrations/${c.id}`)} />);

  return (
    <Screen>
      <Stack.Screen options={{ title: t('Celebrations') }} />
      <Text style={{ color: '#66636f', fontSize: 14 }}>
        {t('A page for your party or event: invitations and RSVPs, a countdown, and a wall of messages, photos and memories.')}
      </Text>
      <Button label={t('Plan a celebration')} onPress={() => router.push('/celebrations/new')} />
      <ErrorText>{error}</ErrorText>
      {list === null && !error ? <Loading /> : null}
      {list !== null && list.length === 0 ? <Empty text={t('Nothing planned yet.')} /> : null}
      {upcoming.length > 0 && <Section title={t('Coming up')}>{rows(upcoming)}</Section>}
      {past.length > 0 && <Section title={t('Past')}>{rows(past)}</Section>}
      <View style={{ height: 8 }} />
    </Screen>
  );
}
