import { Stack } from 'expo-router';
import { colors } from '../../src/ui';

export default function AlbumsLayout() {
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.brand,
        headerStyle: { backgroundColor: colors.page },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.page },
      }}
    />
  );
}
