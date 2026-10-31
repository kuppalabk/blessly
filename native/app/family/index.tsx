import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { t } from '../../src/i18n';
import { Button, ErrorText, Field, Loading, Screen, Section, Title, Row, colors } from '../../src/ui';
import { me as loadMe } from '../../src/api/endpoints';
import { ROLE_LABEL, createFamily, errorMessage, listFamilies, type FamilySummary } from '../../src/api/family';

/** Largest circle any plan allows (matches the website). */
const MAX_MEMBERS = 6;

export default function FamilyListScreen() {
  const { all } = useLocalSearchParams<{ all?: string }>();
  const [families, setFamilies] = useState<FamilySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(() => {
    listFamilies()
      .then((r) => {
        setError(null);
        // With one circle, go straight to it unless the user asked for the list.
        if (r.families.length === 1 && all !== '1') {
          router.replace(`/family/${r.families[0].id}`);
          return;
        }
        setFamilies(r.families);
      })
      .catch((e) => setError(errorMessage(e, t('Could not load your circles.'))));
  }, [all]);
  useFocusEffect(load);

  useEffect(() => {
    const suggest = (surname: string) => (surname ? t('The {surname} family', { surname }) : t('Our family'));
    loadMe()
      .then((r) => setName((prev) => prev || suggest(r.user.name.trim().split(/\s+/).slice(1).join(' '))))
      .catch(() => setName((prev) => prev || t('Our family')));
  }, []);

  async function create() {
    setBusy(true);
    setCreateError(null);
    try {
      const r = await createFamily(name);
      router.push(`/family/${r.family.id}`);
    } catch (e) {
      setCreateError(errorMessage(e, t('Could not create the circle')));
    }
    setBusy(false);
  }

  if (!families) {
    return (
      <Screen>
        <Title>{t('Family Circle')}</Title>
        {error ? <ErrorText>{error}</ErrorText> : <Loading />}
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>{t('Family Circle')}</Title>

      {families.length > 0 ? (
        <Section title={t('Your circles')}>
          {families.map((f) => (
            <Row
              key={f.id}
              title={f.name}
              subtitle={t('{memberCount} of {limit} people · {v}', { memberCount: f.memberCount, limit: f.limit, v: t(ROLE_LABEL[f.role]) })}
              onPress={() => router.push(`/family/${f.id}`)}
              right={<Text style={styles.chevron}>›</Text>}
            />
          ))}
        </Section>
      ) : (
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>{t('Plan together')}</Text>
          <Text style={styles.heroTitle}>{t('Never miss a family birthday again')}</Text>
          <View style={{ gap: 6 }}>
            {[
              'Share birthdays and anniversaries — everyone gets the reminders',
              'Plan events together and see who’s coming',
              'Split the jobs: who’s getting the cake, who’s booking the table',
              'Sign one group card from the whole family',
            ].map((line) => (
              <Text key={line} style={styles.heroItem}>{`• ${t(line)}`}</Text>
            ))}
          </View>
          <Text style={styles.heroSmall}>{t('Free for up to 3 people, or up to {MAX_MEMBERS} with the Family plan. Your private reminders stay private.', { MAX_MEMBERS })}</Text>
        </View>
      )}

      <Section title={families.length ? t('Start another circle') : t('Start your family circle')}>
        <Field label={t('Circle name')} value={name} onChangeText={setName} maxLength={60} />
        <ErrorText>{createError}</ErrorText>
        <Button label={t('Create family circle')} busy={busy} onPress={create} />
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chevron: { fontSize: 22, color: colors.muted },
  hero: { backgroundColor: '#1e1b2e', borderRadius: 14, padding: 16, gap: 12 },
  eyebrow: { fontSize: 12, fontWeight: '700', color: '#9FD9BF', textTransform: 'uppercase' },
  heroTitle: { fontSize: 22, fontWeight: '700', color: '#fff' },
  heroItem: { fontSize: 14, color: '#E4E1EC' },
  heroSmall: { fontSize: 13, color: '#CFCBDA' },
});
