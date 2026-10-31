import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { me } from '../src/api/endpoints';

/** Opens the app: signed-in people go to Home, everyone else to sign-in. */
export default function Index() {
  const [state, setState] = useState<'checking' | 'in' | 'out'>('checking');
  useEffect(() => {
    me().then(() => setState('in')).catch(() => setState('out'));
  }, []);
  if (state === 'checking') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  return <Redirect href={state === 'in' ? '/(tabs)' : '/login'} />;
}
