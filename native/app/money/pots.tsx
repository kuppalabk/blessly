import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { me } from '../../src/api/endpoints';
import { CURRENCIES, createPot, currencyFor, formatMoney, listCelebrationsLite, listCharities, listPots, parseAmount, type CelebrationLite, type Charity, type PotSummary } from '../../src/api/money';
import { t } from '../../src/i18n';
import { Button, ErrorText, Field, Loading, Screen, Section, Title, colors } from '../../src/ui';
import { Chip, TestMode } from './shop';

export default function PotsScreen() {
  const sp = useLocalSearchParams<{ kind?: string; title?: string; for?: string; celebration?: string }>();
  const [pots, setPots] = useState<PotSummary[] | null>(null);
  const [celebrations, setCelebrations] = useState<CelebrationLite[]>([]);
  const [charities, setCharities] = useState<Charity[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Form state. The wishlist and celebration pages link here with a preset (kind, title, for, celebration).
  const [kind, setKind] = useState<'gift' | 'fundraiser'>(sp.kind === 'fundraiser' ? 'fundraiser' : 'gift');
  const [title, setTitle] = useState(sp.title ?? '');
  const [recipient, setRecipient] = useState(sp.for ?? '');
  const [currency, setCurrency] = useState<string>('INR');
  const [target, setTarget] = useState('');
  const [deadline, setDeadline] = useState('');
  const [charityId, setCharityId] = useState('');
  const [celebrationId, setCelebrationId] = useState(sp.celebration ?? '');
  const [story, setStory] = useState('');
  const [showAmounts, setShowAmounts] = useState(true);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(() => {
    listPots().then((r) => setPots(r.pots)).catch((e) => setError(e instanceof Error ? e.message : t('Could not load')));
    listCelebrationsLite().then((r) => setCelebrations(r.celebrations.filter((c) => !c.cancelledAt))).catch(() => setCelebrations([]));
    listCharities().then((r) => setCharities(r.charities)).catch(() => setCharities([]));
    me().then(({ user }) => {
      setCurrency(currencyFor(user.country ?? 'IN'));
    }).catch(() => undefined);
  }, []);
  useFocusEffect(load);

  async function create() {
    setBusy(true);
    setFormError(null);
    try {
      const targetMinor = target.trim() ? parseAmount(target) : null;
      if (target.trim() && targetMinor === null) throw new Error(t('Enter the target like 5000 or 49.99'));
      const { pot } = await createPot({
        kind,
        title: title.trim(),
        story: story.trim() || null,
        recipientName: recipient.trim() || null,
        currency,
        target: targetMinor,
        deadline: deadline.trim() || null,
        charityId: charityId || null,
        celebrationId: celebrationId || null,
        wishlistItemId: null,
        showAmounts
      });
      router.push(`/money/pots/${pot.id}`);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : t('Could not create'));
    } finally {
      setBusy(false);
    }
  }

  if (!pots) return error ? <Screen><ErrorText>{error}</ErrorText></Screen> : <Loading />;

  return (
    <Screen>
      <View style={{ gap: 6 }}>
        <Title>{t('Group gifts and fundraisers')}</Title>
        <Text style={styles.muted}>
          {t('Share one link; friends chip in from anywhere. Group gifts are paid out to you; fundraisers go straight to a verified charity.')}
        </Text>
      </View>
      <TestMode />

      {pots.length > 0 ? (
        <View style={styles.list}>
          {pots.map((p) => (
            <Pressable key={p.id} accessibilityRole="button" onPress={() => router.push(`/money/pots/${p.id}`)} style={styles.item}>
              <Text style={{ fontSize: 24 }}>{p.kind === 'gift' ? '🎁' : '💚'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>{p.title}</Text>
                <Text style={styles.muted}>
                  {p.contributors === 1
                    ? t('{raised} from {n} person', { raised: formatMoney(p.raised, p.currency), n: 1 })
                    : t('{raised} from {n} people', { raised: formatMoney(p.raised, p.currency), n: p.contributors })}
                  {p.target ? ` · ${t('target {v}', { v: formatMoney(p.target, p.currency) })}` : ''}
                  {p.closedAt ? ` · ${t('closed')}` : ''}
                </Text>
              </View>
              <Text style={{ fontSize: 22, color: colors.muted }}>›</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Section title={t('Start a collection')}>
        <View style={styles.seg}>
          <Chip label={t('🎁 Group gift')} on={kind === 'gift'} onPress={() => { setKind('gift'); setCharityId(''); }} />
          <Chip label={t('💚 Fundraiser')} on={kind === 'fundraiser'} onPress={() => setKind('fundraiser')} />
        </View>

        <Field
          label={t('Name')}
          value={title}
          onChangeText={setTitle}
          placeholder={kind === 'gift' ? t('e.g. Leaving gift for Sam') : t('e.g. Dad’s 60th — for the cancer ward')}
          maxLength={100}
        />
        <Field label={kind === 'gift' ? t('Who it’s for') : t('In honour of (optional)')} value={recipient} onChangeText={setRecipient} maxLength={80} />
        <Field label={t('Target (optional)')} value={target} onChangeText={setTarget} keyboardType="decimal-pad" placeholder="5000" />

        <Text style={styles.label}>{t('Currency')}</Text>
        <View style={styles.seg}>
          {CURRENCIES.map((c) => <Chip key={c} label={c} on={currency === c} onPress={() => setCurrency(c)} />)}
        </View>

        <Field label={t('Closes on (optional)')} value={deadline} onChangeText={setDeadline} placeholder="YYYY-MM-DD" maxLength={10} />

        {kind === 'fundraiser' ? (
          <View style={{ gap: 6 }}>
            <Text style={styles.label}>{charities.length ? t('Choose a verified charity') : t('No verified charities yet')}</Text>
            <View style={styles.seg}>
              {charities.map((c) => <Chip key={c.id} label={`${c.name} (${c.country})`} on={charityId === c.id} onPress={() => setCharityId(c.id)} />)}
            </View>
          </View>
        ) : null}

        {celebrations.length > 0 ? (
          <View style={{ gap: 6 }}>
            <Text style={styles.label}>{t('Show on a celebration page (optional)')}</Text>
            <View style={styles.seg}>
              <Chip label={t('None')} on={!celebrationId} onPress={() => setCelebrationId('')} />
              {celebrations.map((c) => <Chip key={c.id} label={c.title} on={celebrationId === c.id} onPress={() => setCelebrationId(c.id)} />)}
            </View>
          </View>
        ) : null}

        <Field label={t('Message to contributors (optional)')} value={story} onChangeText={setStory} multiline maxLength={3000} numberOfLines={4} />

        <View style={styles.switchRow}>
          <Switch value={showAmounts} onValueChange={setShowAmounts} accessibilityLabel={t('Show how much each person gave')} />
          <Text style={{ flex: 1, color: colors.text }}>{t('Show how much each person gave')}</Text>
        </View>

        <ErrorText>{formError}</ErrorText>
        <Button
          label={t('Create')}
          busy={busy}
          disabled={title.trim().length < 3 || (kind === 'fundraiser' && !charityId)}
          onPress={create}
        />
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  label: { fontSize: 14, color: colors.muted },
  seg: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  list: { backgroundColor: colors.surface, borderRadius: 14, overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  itemTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
