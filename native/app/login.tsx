import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ApiError } from '../src/api/client';
import { login } from '../src/api/endpoints';
import { t } from '../src/i18n';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await login(email.trim(), password);
      if (res.mfa) {
        setError(t('Two-step verification is needed. Finish sign-in on the website for now.'));
        return;
      }
      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('Something went wrong. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Blessly</Text>
      <Text style={styles.label}>{t('Email')}</Text>
      <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" />
      <Text style={styles.label}>{t('Password')}</Text>
      <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={[styles.button, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('Log in')}</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 24, paddingTop: 80, gap: 8, backgroundColor: '#fff' },
  title: { fontSize: 32, fontWeight: '700', marginBottom: 24 },
  label: { fontSize: 14, color: '#555', marginTop: 8 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 10, padding: 12, fontSize: 16 },
  error: { color: '#b00020', marginTop: 8 },
  button: { backgroundColor: '#5b3fd6', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 16 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
