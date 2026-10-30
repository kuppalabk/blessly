import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { me } from '../../src/api/endpoints';
import { CURRENCIES, GIFT_BRANDS, buyGiftCard, currencyFor, formatMoney, openPayment, type Brand } from '../../src/api/money';
import { t } from '../../src/i18n';
import { Button, ErrorText, Field, Screen, Section, Title, colors } from '../../src/ui';
import { Chip, TestMode } from './shop';

export default function GiftCardsScreen() {
  const [sel, setSel] = useState<Brand | null>(null);
  const [cur, setCur] = useState<string>('INR');
  const [value, setValue] = useState<number | null>(null);
  const [v, setV] = useState({ recipientName: '', recipientEmail: '', message: '', deliverOn: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    me().then(({ user }) => setCur(currencyFor(user.country ?? 'IN'))).catch(() => undefined);
  }, []));

  const values = sel?.denominations[cur as keyof Brand['denominations']] ?? [];

  async function buy() {
    if (!sel || !value) return;
    setBusy(true);
    setError(null);
    try {
      const { checkoutUrl } = await buyGiftCard({
        brand: sel.id,
        currency: cur,
        value,
        recipientName: v.recipientName.trim(),
        recipientEmail: v.recipientEmail.trim(),
        message: v.message.trim() || undefined,
        deliverOn: v.deliverOn.trim() || undefined
      });
      await openPayment(checkoutUrl);
      router.push('/money/orders');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Something went wrong'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={{ gap: 6 }}>
        <Title>{t('Gift cards')}</Title>
        <Text style={styles.muted}>{t('Choose a card, pick an amount, and we’ll email it — now, or on the day.')}</Text>
      </View>
      <TestMode />
      <Text style={styles.muted}>
        {t('These are sandbox brands for testing. Real brands come from a gift card partner once it’s connected.')}
      </Text>

      <View style={styles.grid}>
        {GIFT_BRANDS.map((b) => {
          const on = sel?.id === b.id;
          return (
            <Pressable
              key={b.id}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => { setSel(b); setValue(null); setError(null); }}
              style={[styles.brand, { borderColor: on ? colors.brand : colors.line, borderWidth: on ? 2 : 1, backgroundColor: b.color + '22' }]}
            >
              <Text style={{ fontSize: 30 }}>{b.emoji}</Text>
              <Text style={styles.brandName}>{b.name}</Text>
              <Text style={styles.muted}>{b.category}</Text>
            </Pressable>
          );
        })}
      </View>

      {sel ? (
        <Section title={`${sel.emoji} ${sel.name}`}>
          <Text style={styles.label}>{t('Currency')}</Text>
          <View style={styles.chips}>
            {CURRENCIES.map((c) => (
              <Chip key={c} label={c} on={cur === c} onPress={() => { setCur(c); setValue(null); }} />
            ))}
          </View>
          <Text style={styles.label}>{t('Value')}</Text>
          <View style={styles.chips}>
            {values.map((x) => <Chip key={x} label={formatMoney(x, cur)} on={value === x} onPress={() => setValue(x)} />)}
          </View>

          <Field label={t('Recipient’s name')} value={v.recipientName} onChangeText={(recipientName) => setV({ ...v, recipientName })} maxLength={80} />
          <Field label={t('Recipient’s email')} value={v.recipientEmail} onChangeText={(recipientEmail) => setV({ ...v, recipientEmail })} keyboardType="email-address" autoCapitalize="none" maxLength={200} />
          <Field label={t('Send on (optional — e.g. their birthday)')} value={v.deliverOn} onChangeText={(deliverOn) => setV({ ...v, deliverOn })} placeholder="YYYY-MM-DD" maxLength={10} />
          <Field label={t('Message (optional)')} value={v.message} onChangeText={(message) => setV({ ...v, message })} maxLength={300} />

          <Text style={styles.muted}>{sel.terms}</Text>
          <ErrorText>{error}</ErrorText>
          <Button
            label={value ? t('Buy {amount} gift card', { amount: formatMoney(value, cur) }) : t('Buy gift card')}
            busy={busy}
            disabled={!value || !v.recipientName.trim() || !v.recipientEmail.trim()}
            onPress={buy}
          />
        </Section>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  label: { fontSize: 14, color: colors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  brand: { width: '47%', borderRadius: 14, padding: 12, gap: 4, backgroundColor: colors.surface },
  brandName: { fontSize: 15, fontWeight: '600', color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
