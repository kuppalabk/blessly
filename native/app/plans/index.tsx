import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { cancelPlan, getPlans, openWebPage, startPlanCheckout, type Plan, type PlansView } from '../../src/api/account';
import { me } from '../../src/api/endpoints';
import { formatMoney, openPayment } from '../../src/api/money';
import { t } from '../../src/i18n';
import { Button, ErrorText, Loading, Screen, Title, colors } from '../../src/ui';

type Currency = 'INR' | 'USD';
type Period = 'month' | 'year';

function features(p: Plan): string[] {
  const f = [
    t('Reminders, AI wishes in 32 languages, 250 cards per occasion'),
    t('Family circle of up to {n} people', { n: p.maxFamilyMembers })
  ];
  f.push(p.maxAlbums >= 100
    ? t('Unlimited photo albums, {photos} photos each', { photos: p.maxPhotosPerAlbum })
    : `${p.maxAlbums === 1 ? t('{n} photo album', { n: p.maxAlbums }) : t('{n} photo albums', { n: p.maxAlbums })}, ${t('{photos} photos each', { photos: p.maxPhotosPerAlbum })}`);
  if (p.businessMessages) {
    f.push(t('Business: {n} customer wishes a month on WhatsApp and email', { n: p.businessMessages.toLocaleString() }));
    f.push(t('{n} team logins', { n: p.businessSeats }));
  }
  return f;
}

/**
 * Pricing cards, the same as the website's PlanCards. With currentPlan set, the cards show choose and cancel
 * buttons. Without it (signed-out visitors), the buttons send people to the website sign-up page.
 */
export function PlanCards({ plans, defaultCurrency, currentPlan, cancelAtPeriodEnd, periodEnd, onChanged }: {
  plans: Plan[]; defaultCurrency: Currency; currentPlan?: string; cancelAtPeriodEnd?: boolean; periodEnd?: string | null; onChanged?: () => void;
}) {
  const [period, setPeriod] = useState<Period>('month');
  const [currency, setCurrency] = useState<Currency>(defaultCurrency);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(!!cancelAtPeriodEnd);

  const price = (p: Plan) => (currency === 'INR' ? (period === 'month' ? p.inrMonthly : p.inrYearly) : (period === 'month' ? p.usdMonthly : p.usdYearly));

  async function choose(planId: string) {
    setBusy(planId);
    setError(null);
    setNotice(null);
    try {
      const { url } = await startPlanCheckout(planId as 'family' | 'business', period, currency);
      await openPayment(url);
      setNotice(t('Thanks! Your plan switches on as soon as the payment is confirmed — usually within a few seconds. Refresh this page in a moment.'));
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Could not open the payment page'));
    } finally {
      setBusy(null);
    }
  }

  function cancel() {
    Alert.alert(t('Cancel plan'), t('Cancel your plan? It keeps working until the end of the period you paid for.'), [
      { text: t('Cancel'), style: 'cancel' },
      {
        text: t('Cancel plan'), style: 'destructive', onPress: async () => {
          setBusy('cancel');
          setError(null);
          try {
            await cancelPlan();
            setCancelled(true);
          } catch (e) {
            setError(e instanceof Error ? e.message : t('Could not cancel'));
          } finally {
            setBusy(null);
          }
        }
      }
    ]);
  }

  return (
    <View style={{ gap: 16 }}>
      <View style={styles.toggles}>
        <View style={styles.seg} accessibilityLabel={t('Billing period')}>
          <Chip label={t('Monthly')} on={period === 'month'} onPress={() => setPeriod('month')} />
          <Chip label={t('Yearly · save 20%')} on={period === 'year'} onPress={() => setPeriod('year')} />
        </View>
        <View style={styles.seg} accessibilityLabel={t('Currency')}>
          <Chip label={t('₹ INR')} on={currency === 'INR'} onPress={() => setCurrency('INR')} />
          <Chip label={t('$ USD')} on={currency === 'USD'} onPress={() => setCurrency('USD')} />
        </View>
      </View>

      {plans.map((p) => {
        const isCurrent = currentPlan === p.id;
        const amount = price(p);
        const popular = p.id === 'family';
        return (
          <View key={p.id} style={[styles.card, popular && styles.cardPop]} accessibilityLabel={t('{name} plan', { name: p.name })}>
            {popular ? <Text style={styles.badgePurple}>{t('Most popular')}</Text> : null}
            <Text style={styles.planName}>{p.name}</Text>
            <Text>
              <Text style={styles.price}>{amount ? formatMoney(amount, currency) : t('Free')}</Text>
              {amount ? <Text style={styles.muted}> / {period === 'month' ? t('month') : t('year')}</Text> : null}
            </Text>
            <View style={{ gap: 6 }}>
              {features(p).map((f) => <Text key={f} style={styles.feature}>• {f}</Text>)}
            </View>
            <View style={{ marginTop: 6, gap: 8 }}>
              {currentPlan === undefined ? (
                <Button
                  label={p.id === 'free' ? t('Start free') : t('Try {name}', { name: p.name })}
                  variant={popular ? 'primary' : 'secondary'}
                  onPress={() => openWebPage('/signup')}
                />
              ) : isCurrent ? (
                <View style={{ gap: 6 }}>
                  <Text style={styles.badgeGreen}>{t('Your plan')}</Text>
                  {p.id !== 'free' && (cancelled ? (
                    <Text style={styles.muted}>
                      {t('Cancelled — works until')}{' '}
                      {periodEnd ? new Date(periodEnd).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : t('the end of the period')}.
                    </Text>
                  ) : (
                    <Button label={t('Cancel plan')} variant="secondary" busy={busy === 'cancel'} onPress={cancel} />
                  ))}
                </View>
              ) : p.id === 'free' ? null : (
                <Button
                  label={busy === p.id ? t('Opening payment…') : t('Choose {name}', { name: p.name })}
                  variant={popular ? 'primary' : 'secondary'}
                  busy={busy === p.id}
                  disabled={!!busy}
                  onPress={() => choose(p.id)}
                />
              )}
            </View>
          </View>
        );
      })}

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      <ErrorText>{error}</ErrorText>
      <Text style={styles.small}>
        {currency === 'INR' ? t('Pay with UPI AutoPay, cards or netbanking through Razorpay.') : t('Pay by card through Stripe.')}{' '}
        {t('Cancel any time; your plan works until the end of the paid period. Taxes may apply.')}
      </Text>
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

export default function PlansScreen() {
  const [data, setData] = useState<PlansView | null>(null);
  const [country, setCountry] = useState('IN');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getPlans().then(setData).catch((e) => setError(e instanceof Error ? e.message : t('Could not load plans')));
    me().then(({ user }) => setCountry(user.country ?? 'IN')).catch(() => undefined);
  }, []);
  useFocusEffect(load);

  if (!data) return error ? <Screen><ErrorText>{error}</ErrorText></Screen> : <Loading />;

  const current = data.plans.find((p) => p.id === data.currentPlan);

  return (
    <Screen>
      <Title>{t('Plans')}</Title>
      <Text style={styles.small}>
        {t('You’re on')} <Text style={styles.bold}>{current?.name ?? t('Free')}</Text>
        {data.pastDue ? t(' — your last payment failed; please update your payment method') : ''}.
      </Text>
      <PlanCards
        plans={data.plans}
        defaultCurrency={country === 'IN' ? 'INR' : 'USD'}
        currentPlan={data.currentPlan}
        cancelAtPeriodEnd={data.cancelAtPeriodEnd}
        periodEnd={data.periodEnd}
        onChanged={load}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  toggles: { gap: 8, alignItems: 'center' },
  seg: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center' },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontSize: 14, color: colors.text },
  chipTextOn: { color: '#fff', fontWeight: '600' },
  card: { backgroundColor: colors.surface, borderRadius: 14, padding: 16, gap: 8, borderWidth: 1, borderColor: colors.line },
  cardPop: { borderColor: colors.brand, borderWidth: 2 },
  planName: { fontSize: 20, fontWeight: '700', color: colors.text },
  price: { fontSize: 30, fontWeight: '700', color: colors.text },
  feature: { fontSize: 14, color: colors.text, lineHeight: 20 },
  badgePurple: { alignSelf: 'flex-start', color: colors.brand, backgroundColor: '#efeafc', borderRadius: 999, paddingVertical: 2, paddingHorizontal: 10, fontSize: 13, overflow: 'hidden' },
  badgeGreen: { alignSelf: 'flex-start', color: '#1f6b4f', backgroundColor: '#e3f4ec', borderRadius: 999, paddingVertical: 2, paddingHorizontal: 10, fontSize: 13, overflow: 'hidden' },
  notice: { color: colors.brand, fontSize: 14, lineHeight: 20 },
  bold: { fontWeight: '700', color: colors.text },
  muted: { color: colors.muted, fontSize: 14 },
  small: { color: colors.muted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
