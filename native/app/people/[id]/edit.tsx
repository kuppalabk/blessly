import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { canEditFamily, getPerson, listFamilies, type FamilyOption, type PersonInput, type PersonView } from '../../../src/api/people';
import { ErrorText, Loading, Screen, colors } from '../../../src/ui';
import { PersonForm } from '../new';
import { t } from '../../../src/i18n';

function toInput(p: PersonView): PersonInput {
  return {
    name: p.name,
    relationship: p.relationship,
    phone: p.phone,
    email: p.email,
    language: p.language,
    notes: p.notes,
    familyId: p.familyId,
    occasions: p.occasions.map((o) => ({
      kind: o.kind,
      label: o.kind === 'custom' ? o.label : null,
      month: o.month,
      day: o.day,
      remindGift: o.remindGift,
      remindIdeas: o.remindIdeas,
      remindDraft: o.remindDraft,
      remindDay: o.remindDay,
    })),
  };
}

export default function EditPersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [person, setPerson] = useState<PersonView | null>(null);
  const [families, setFamilies] = useState<FamilyOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getPerson(id), listFamilies()])
      .then(([p, f]) => {
        setPerson(p.person);
        // Keep the circle the person is already in, even if the user can no longer add to it.
        setFamilies(f.families.filter((x) => canEditFamily(x.role) || x.id === p.person.familyId));
      })
      .catch((e) => setError(e instanceof Error ? e.message : t('Could not load this person.')));
  }, [id]);

  if (error) return <Screen scroll={false}><ErrorText>{error}</ErrorText></Screen>;
  if (!person || !families) return <Screen scroll={false}><Loading /></Screen>;

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('Back')} onPress={() => (router.canGoBack() ? router.back() : router.replace(`/people/${person.id}`))} style={styles.back}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.h1}>{t('Edit {name}', { name: person.name })}</Text>
      </View>
      <PersonForm personId={person.id} initial={toInput(person)} families={families} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  backText: { fontSize: 28, color: colors.brand, marginTop: -4 },
  h1: { fontSize: 24, fontWeight: '700', color: colors.text, flexShrink: 1 },
});
