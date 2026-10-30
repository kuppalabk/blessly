import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { t } from '../../src/i18n';
import { Button, ErrorText, Loading, colors } from '../../src/ui';
import { ApiError } from '../../src/api/client';
import { ROLE_LABEL, acceptInvite, errorMessage, previewInvite, type InvitePreview } from '../../src/api/family';

const PERKS = [
  'Get reminders for the birthdays and anniversaries the family shares',
  'RSVP to family events and pick up tasks',
  'Sign group cards together',
  'Your own people and reminders stay private',
];

export default function JoinScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  // undefined: loading. null: the link is not valid.
  const [inv, setInv] = useState<InvitePreview | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    previewInvite(token)
      .then(setInv)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) router.replace('/login');
        else if (e instanceof ApiError && e.status === 404) setInv(null);
        else setError(errorMessage(e, t('Could not load the invite.')));
      });
  }, [token]);

  async function join() {
    setBusy(true);
    setJoinError(null);
    try {
      const r = await acceptInvite(token);
      router.push(`/family/${r.familyId}`);
    } catch (e) {
      setJoinError(errorMessage(e, t('Could not join')));
    }
    setBusy(false);
  }

  if (inv === undefined) {
    return <View style={styles.page}>{error ? <ErrorText>{error}</ErrorText> : <Loading />}</View>;
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pad}>
      <View style={styles.card}>
        {inv === null ? (
          <>
            <Text style={styles.h1}>{t('This invite link doesn’t work')}</Text>
            <Text style={styles.muted}>{t('Check you copied the whole link, or ask for a new one.')}</Text>
            <Button label={t('Go to Blessly')} onPress={() => router.replace('/(tabs)')} />
          </>
        ) : (
          <>
            <View style={styles.center}>
              <Text style={styles.muted}>{t('{inviter} invited you to', { inviter: inv.inviter })}</Text>
              <Text style={[styles.h1, { textAlign: 'center' }]}>{inv.familyName}</Text>
              <Text style={[styles.muted, { textAlign: 'center' }]}>
                {`${inv.memberCount === 1 ? t('{n} person', { n: 1 }) : t('{n} people', { n: inv.memberCount })} · ${t('you’ll join as: {role}', { role: t(ROLE_LABEL[inv.role]) })}`}
              </Text>
            </View>
            <View style={{ gap: 6 }}>
              {PERKS.map((p) => (
                <Text key={p} style={styles.perk}>{`• ${t(p)}`}</Text>
              ))}
            </View>
            {inv.status === 'ok' ? (
              <Button label={t('Join the family circle')} busy={busy} onPress={join} />
            ) : null}
            {inv.status === 'member' ? (
              <Button label={t('You’re already in — open the circle')} variant="secondary" onPress={() => router.push(`/family/${inv.familyId}`)} />
            ) : null}
            {inv.status === 'expired' ? <Text style={styles.notice}>{t('This invite has expired. Ask {inviter} for a new link.', { inviter: inv.inviter })}</Text> : null}
            {inv.status === 'revoked' ? <Text style={styles.notice}>{t('This invite was cancelled. Ask {inviter} for a new link.', { inviter: inv.inviter })}</Text> : null}
            {inv.status === 'full' ? <Text style={styles.notice}>{t('This circle is full (6 people).')}</Text> : null}
            <ErrorText>{joinError}</ErrorText>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.page },
  pad: { padding: 16, flexGrow: 1, justifyContent: 'center' },
  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 20, gap: 16, borderWidth: 1, borderColor: colors.line },
  center: { alignItems: 'center', gap: 6 },
  h1: { fontSize: 26, fontWeight: '700', color: colors.text },
  muted: { fontSize: 14, color: colors.muted },
  perk: { fontSize: 14, color: colors.text },
  notice: { fontSize: 14, color: colors.text, backgroundColor: colors.page, borderRadius: 10, padding: 12 },
});
