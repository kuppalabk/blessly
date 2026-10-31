import { Tabs } from 'expo-router';
import { t } from '../../src/i18n';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen name="index" options={{ title: t('Home') }} />
      <Tabs.Screen name="people" options={{ title: t('People') }} />
      <Tabs.Screen name="family" options={{ title: t('Family') }} />
      <Tabs.Screen name="calendar" options={{ title: t('Calendar') }} />
      <Tabs.Screen name="more" options={{ title: t('More') }} />
    </Tabs>
  );
}
