import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { canEditFamily, createPerson, listFamilies, OCCASION_KINDS, RELATIONSHIPS, updatePerson, type FamilyOption, type OccasionInput, type OccasionKind, type PersonInput } from '../../src/api/people';
import { LANGUAGES } from '../../src/api/wishes';
import { Button, ErrorText, Field, Loading, Screen, Section, colors } from '../../src/ui';
import { t } from '../../src/i18n';

const REMINDERS = [
  { key: 'remindGift', when: '7 days before', what: 'Gift reminder' },
  { key: 'remindIdeas', when: '3 days before', what: 'Gift ideas' },
  { key: 'remindDraft', when: '1 day before', what: 'Wish drafted for you' },
  { key: 'remindDay', when: 'On the day', what: 'Reminder to send' },
] as const;

const blankOcc = (): OccasionInput => ({ kind: 'birthday', label: null, month: 1, day: 1, remindGift: true, remindIdeas: true, remindDraft: true, remindDay: true });

const monthName = (m: number) => new Date(2000, m - 1, 1).toLocaleDateString(undefined, { month: 'long' });

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.chip, selected && styles.chipOn]}>
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

/** Add or edit a person. Used by app/people/new.tsx and app/people/[id]/edit.tsx. */
export function PersonForm({ initial, personId, families, defaultFamily = null }: { initial?: PersonInput; personId?: string; families: FamilyOption[]; defaultFamily?: string | null }) {
  const [p, setP] = useState<PersonInput>(initial ?? { name: '', relationship: 'Friend', phone: '', email: '', language: 'en', notes: '', occasions: [blankOcc()], familyId: defaultFamily });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setOcc = (i: number, patch: Partial<OccasionInput>) => setP({ ...p, occasions: p.occasions.map((o, k) => (k === i ? { ...o, ...patch } : o)) });

  async function save() {
    setBusy(true); setError(null);
    const body: PersonInput = {
      ...p,
      phone: p.phone?.trim() || null,
      email: p.email?.trim() || null,
      notes: p.notes?.trim() || null,
      familyId: p.familyId || null,
      occasions: p.occasions.map((o) => ({ ...o, label: o.kind === 'custom' ? o.label?.trim() || null : null })),
    };
    try {
      const res = personId ? await updatePerson(personId, body) : await createPerson(body);
      router.replace(`/people/${res.person.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Could not save'));
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 16 }}>
      <Section>
        <Field label={t('Name')} value={p.name} onChangeText={(v) => setP({ ...p, name: v })} />
        <Text style={styles.label}>{t('Relationship')}</Text>
        <View style={styles.wrap}>
          {RELATIONSHIPS.map((r) => <Chip key={r} label={t(r)} selected={p.relationship === r} onPress={() => setP({ ...p, relationship: r })} />)}
        </View>
        <Text style={styles.label}>{t('Wish language')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {LANGUAGES.map((l) => <Chip key={l.code} label={l.label} selected={p.language === l.code} onPress={() => setP({ ...p, language: l.code })} />)}
        </ScrollView>
        <Field label={t('Mobile (for WhatsApp and SMS)')} placeholder="+44 7700 900123" keyboardType="phone-pad" value={p.phone ?? ''} onChangeText={(v) => setP({ ...p, phone: v })} />
        <Field label={t('Email')} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} value={p.email ?? ''} onChangeText={(v) => setP({ ...p, email: v })} />
        <Field label={t('Notes for personal wishes (optional)')} placeholder={t('e.g. loves trekking, our Goa trip')} value={p.notes ?? ''} onChangeText={(v) => setP({ ...p, notes: v })} />
      </Section>

      <Section title={t('Occasions')}>
        {p.occasions.map((o, i) => (
          <View key={i} style={styles.occasion}>
            <Text style={styles.label}>{t('Type')}</Text>
            <View style={styles.wrap}>
              {OCCASION_KINDS.map((k) => <Chip key={k.id} label={t(k.label)} selected={o.kind === k.id} onPress={() => setOcc(i, { kind: k.id as OccasionKind })} />)}
            </View>
            {o.kind === 'custom' && (
              <Field label={t('Name of occasion')} placeholder={t('e.g. Name day')} value={o.label ?? ''} onChangeText={(v) => setOcc(i, { label: v })} />
            )}
            <Text style={styles.label}>{t('Month')}</Text>
            <View style={styles.wrap}>
              {Array.from({ length: 12 }, (_, k) => k + 1).map((m) => <Chip key={m} label={monthName(m)} selected={o.month === m} onPress={() => setOcc(i, { month: m })} />)}
            </View>
            <Field label={t('Day')} keyboardType="number-pad" value={o.day ? String(o.day) : ''} onChangeText={(v) => setOcc(i, { day: Number(v) || 0 })} />
            <Text style={styles.label}>{t('Reminders')}</Text>
            {REMINDERS.map((r) => (
              <View key={r.key} style={styles.reminder}>
                <Text style={styles.reminderText}>{`${t(r.when)} · ${t(r.what)}`}</Text>
                <Switch value={o[r.key]} onValueChange={(v) => setOcc(i, { [r.key]: v } as Partial<OccasionInput>)} accessibilityLabel={`${t(r.what)}, ${t(r.when)}`} />
              </View>
            ))}
            <Button label={t('Remove')} variant="secondary" onPress={() => setP({ ...p, occasions: p.occasions.filter((_, k) => k !== i) })} />
          </View>
        ))}
        {p.occasions.length < 10 && <Button label={t('+ Add occasion')} variant="secondary" onPress={() => setP({ ...p, occasions: [...p.occasions, blankOcc()] })} />}
      </Section>

      {families.length > 0 && (
        <Section>
          <Text style={styles.label}>{t('Share with family')}</Text>
          <View style={styles.wrap}>
            <Chip label={t('Private — only me')} selected={!p.familyId} onPress={() => setP({ ...p, familyId: null })} />
            {families.map((f) => <Chip key={f.id} label={f.name} selected={p.familyId === f.id} onPress={() => setP({ ...p, familyId: f.id })} />)}
          </View>
          <Text style={styles.hint}>{p.familyId ? t('Everyone in this circle will see this person and get their reminders. Only you can edit them.') : t('Only you can see this person and their reminders.')}</Text>
        </Section>
      )}

      <ErrorText>{error}</ErrorText>
      <Button label={personId ? t('Save changes') : t('Save person')} onPress={save} busy={busy} />
    </View>
  );
}

export default function NewPersonScreen() {
  const { family } = useLocalSearchParams<{ family?: string }>();
  const [families, setFamilies] = useState<FamilyOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listFamilies()
      .then((r) => setFamilies(r.families.filter((f) => canEditFamily(f.role))))
      .catch(() => setError(t('Could not load your family circles.')));
  }, []);

  if (!families) return <Screen scroll={false}>{error ? <ErrorText>{error}</ErrorText> : <Loading />}</Screen>;
  return (
    <Screen>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('Back to people')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/people'))} style={styles.back}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.h1}>{t('Add someone special')}</Text>
      </View>
      <PersonForm families={families} defaultFamily={family && families.some((f) => f.id === family) ? family : null} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  backText: { fontSize: 28, color: colors.brand, marginTop: -4 },
  h1: { fontSize: 24, fontWeight: '700', color: colors.text, flexShrink: 1 },
  label: { fontSize: 14, color: colors.muted },
  hint: { fontSize: 13, color: colors.muted },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontSize: 14, color: colors.text },
  chipTextOn: { color: '#fff', fontWeight: '600' },
  occasion: { backgroundColor: colors.page, borderRadius: 12, padding: 12, gap: 8 },
  reminder: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  reminderText: { flex: 1, fontSize: 14, color: colors.text },
});
