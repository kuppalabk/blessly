import { router, useFocusEffect } from 'expo-router';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { logout, me, type User } from '../../src/api/endpoints';
import { COUNTRIES, LANGUAGES, deleteMe, exportMyData, getPlans, openWebPage, timezoneOptions, updateMe } from '../../src/api/account';
import { t, setLanguage } from '../../src/i18n';
import { Button, ErrorText, Field, Loading, Row, Screen, Section, Title, colors } from '../../src/ui';

export default function SettingsScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [form, setForm] = useState({ name: '', timezone: '', country: 'IN', language: 'en' });
  const [planName, setPlanName] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [zonesOpen, setZonesOpen] = useState(false);
  const [zoneQuery, setZoneQuery] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [delPassword, setDelPassword] = useState('');
  const [delConfirm, setDelConfirm] = useState('');
  const [delError, setDelError] = useState<string | null>(null);

  const load = useCallback(() => {
    me()
      .then(({ user: u }) => {
        setUser(u);
        setForm({ name: u.name, timezone: u.timezone, country: u.country ?? 'IN', language: u.language ?? 'en' });
      })
      .catch((e) => setError(e instanceof Error ? e.message : t('Could not load settings')));
    // The plan name is shown when the server can say which plan the user is on.
    getPlans()
      .then((p) => setPlanName(p.plans.find((x) => x.id === p.currentPlan)?.name ?? null))
      .catch(() => setPlanName(null));
  }, []);
  useFocusEffect(load);

  async function save() {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const { user: u } = await updateMe({ name: form.name, timezone: form.timezone, country: form.country, language: form.language });
      setUser(u);
      setLanguage(form.language);
      setMsg(t('Saved'));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Could not save'));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await logout().catch(() => undefined);
    router.replace('/login');
  }

  async function download() {
    setError(null);
    try {
      const data = await exportMyData();
      const file = new File(Paths.cache, `blessly-data-${new Date().toISOString().slice(0, 10)}.json`);
      await file.write(JSON.stringify(data, null, 2));
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: t('Save your Blessly data') });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Could not download your data'));
    }
  }

  async function deleteAccount() {
    setBusy(true);
    setDelError(null);
    try {
      await deleteMe(delPassword);
      router.replace('/login');
    } catch (e) {
      setDelError(e instanceof Error ? e.message : t('Could not delete'));
      setBusy(false);
    }
  }

  if (!user) return error ? <Screen><ErrorText>{error}</ErrorText></Screen> : <Loading />;

  const zones = timezoneOptions(form.timezone).filter((z) => z.toLowerCase().includes(zoneQuery.trim().toLowerCase())).slice(0, 80);

  return (
    <Screen>
      <Title>{t('Settings')}</Title>
      <Text style={styles.muted}>{user.email}</Text>

      <Section>
        <Row
          title={planName ? t('Plan: {name}', { name: planName }) : t('Plans')}
          subtitle={t('Family circles, albums and business messages')}
          onPress={() => router.push('/plans')}
          right={<Text style={styles.chev}>›</Text>}
        />
        <Row
          title={t('Sign-in and security')}
          subtitle={t('Two-step verification, Google and Apple, phone sign-in, password')}
          onPress={() => router.push('/settings/security')}
          right={<Text style={styles.chev}>›</Text>}
        />
      </Section>

      <Section>
        <Field label={t('Name')} value={form.name} onChangeText={(name) => setForm({ ...form, name })} maxLength={80} />

        <View style={styles.field}>
          <Text style={styles.label}>{t('Timezone (reminders arrive at 9am here)')}</Text>
          <Pressable style={styles.select} onPress={() => setZonesOpen(!zonesOpen)} accessibilityRole="button" accessibilityLabel={t('Timezone')}>
            <Text style={styles.selectText}>{form.timezone}</Text>
          </Pressable>
          {zonesOpen ? (
            <View style={styles.listBox}>
              <TextInput style={styles.search} value={zoneQuery} onChangeText={setZoneQuery} placeholder={t('Search')} placeholderTextColor={colors.muted} autoCapitalize="none" />
              <ScrollView style={{ maxHeight: 240 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {zones.map((z) => (
                  <Pressable key={z} style={styles.listItem} onPress={() => { setForm({ ...form, timezone: z }); setZonesOpen(false); setZoneQuery(''); }}>
                    <Text style={[styles.listText, z === form.timezone && { color: colors.brand, fontWeight: '600' }]}>{z}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('Country (festival calendar)')}</Text>
          <View style={styles.chips}>
            {COUNTRIES.map((c) => (
              <Pressable key={c.code} accessibilityRole="button" style={[styles.chip, form.country === c.code && styles.chipOn]} onPress={() => setForm({ ...form, country: c.code })}>
                <Text style={[styles.chipText, form.country === c.code && styles.chipTextOn]}>{c.code === 'XX' ? t('Other') : c.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('Language (app and wishes)')}</Text>
          <View style={styles.chips}>
            {LANGUAGES.map((l) => (
              <Pressable key={l.code} accessibilityRole="button" style={[styles.chip, form.language === l.code && styles.chipOn]} onPress={() => setForm({ ...form, language: l.code })}>
                <Text style={[styles.chipText, form.language === l.code && styles.chipTextOn]}>{l.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {msg ? <Text style={styles.notice}>{msg}</Text> : null}
        <ErrorText>{error}</ErrorText>
        <Button label={t('Save settings')} onPress={save} busy={busy} />
      </Section>

      <Button label={t('Log out')} variant="secondary" onPress={signOut} />

      <Section title={t('Your data')}>
        <Text style={styles.small}>
          {t('Download a copy of everything Blessly stores about you, or delete your account. Read our')}{' '}
          <Text style={styles.link} onPress={() => openWebPage('/privacy')}>{t('privacy policy')}</Text>{' '}
          {t('and')}{' '}
          <Text style={styles.link} onPress={() => openWebPage('/terms')}>{t('terms')}</Text>.
        </Text>
        <Button label={t('Download my data')} variant="secondary" onPress={download} />
        {!deleting ? (
          <Button label={t('Delete my account…')} variant="danger" onPress={() => setDeleting(true)} />
        ) : (
          <View style={{ gap: 8 }}>
            <Text style={styles.small}>
              <Text style={{ fontWeight: '700' }}>{t('This permanently deletes your account')}</Text>
              {t(', your people, reminders, wishes and wish pages, and your business with its customers. Family circles you own pass to the next person in the circle. This can’t be undone.')}
            </Text>
            <Field label={t('Your password')} value={delPassword} onChangeText={setDelPassword} secureTextEntry autoComplete="current-password" />
            <Field label={t('Type DELETE to confirm')} value={delConfirm} onChangeText={setDelConfirm} autoCapitalize="characters" autoCorrect={false} />
            <ErrorText>{delError}</ErrorText>
            <Button label={t('Delete forever')} variant="danger" onPress={deleteAccount} busy={busy} disabled={delConfirm !== 'DELETE' || !delPassword} />
            <Button label={t('Cancel')} variant="secondary" onPress={() => { setDeleting(false); setDelError(null); setDelPassword(''); setDelConfirm(''); }} />
          </View>
        )}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  muted: { color: colors.muted, marginTop: -8 },
  small: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  link: { color: colors.brand, textDecorationLine: 'underline' },
  notice: { color: colors.brand, fontSize: 14 },
  chev: { fontSize: 22, color: colors.muted },
  field: { gap: 4 },
  label: { fontSize: 14, color: colors.muted },
  select: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 12, backgroundColor: colors.surface },
  selectText: { fontSize: 16, color: colors.text },
  listBox: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, overflow: 'hidden' },
  search: { padding: 12, fontSize: 16, color: colors.text, borderBottomWidth: 1, borderBottomColor: colors.line },
  listItem: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  listText: { fontSize: 15, color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontSize: 14, color: colors.text },
  chipTextOn: { color: '#fff', fontWeight: '600' },
});
