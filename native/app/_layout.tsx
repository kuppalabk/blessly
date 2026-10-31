import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { deviceLanguage, setLanguage } from '../src/i18n';

export default function RootLayout() {
  useEffect(() => setLanguage(deviceLanguage()), []);
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
