import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { me } from '../../../src/api/endpoints';
import { openWebPage } from '../../../src/api/account';
import { DESIGN_EDITOR_PATH, getCard, orderPrints, type CardDetail } from '../../../src/api/designs';
import { PRINT_COUNTRIES, PRINT_PRICE, blankAddress, currencyFor, formatMoney, openPayment, type Address } from '../../../src/api/money';
import { AddressFields, Chip, TestMode } from '../../money/shop';
import { t } from '../../../src/i18n';
import { Button, ErrorText, Loading, Screen, Section, Title, colors } from '../../../src/ui';

export default function PrintScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [card, setCard] = useState<CardDetail | null>(null);
  const [qty, setQty] = useState(1);
  const [currency, setCurrency] = useState<string>('INR');
  const [address, setAddress] = useState<Address>(blankAddress('IN'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getCard(id).then(({ design }) => setCard(design)).catch((e) => setError(e instanceof Error ? e.message : t('Card not found')));
    me().then(({ user }) => {
      const country = user.country ?? 'IN';
      setCurrency(currencyFor(country));
      setAddress((a) => (a.name ? a : blankAddress(PRINT_COUNTRIES.includes(country) ? country : 'IN')));
    }).catch(() => undefined);
  }, [id]);
  useFocusEffect(load);

  async function order() {
    setBusy(true);
    setError(null);
    try {
      const { checkoutUrl } = await orderPrints(id, { quantity: qty, address, currency });
      await openPayment(checkoutUrl);
      router.push('/money/orders');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Something went wrong'));
    } finally {
      setBusy(false);
    }
  }

  if (!card) return error ? <Screen><ErrorText>{error}</ErrorText></Screen> : <Loading />;

  const ready = !!card.frontUrl && !!card.insideUrl;

  return (
    <Screen>
      <Title>{t('Print and post “{title}”', { title: card.title })}</Title>
      <TestMode />

      {ready ? (
        <>
          <View style={styles.previewRow}>
            <Image source={{ uri: card.frontUrl! }} style={styles.page} resizeMode="cover" accessibilityLabel={t('Front of the card')} />
            <Image source={{ uri: card.insideUrl! }} style={styles.page} resizeMode="cover" accessibilityLabel={t('Inside of the card')} />
          </View>

          <Section>
            <Text style={styles.label}>{t('How many')}</Text>
            <View style={styles.chips}>
              {[1, 2, 3, 5, 10].map((n) => <Chip key={n} label={String(n)} on={qty === n} onPress={() => setQty(n)} />)}
            </View>
            <Text style={styles.label}>{t('Currency')}</Text>
            <View style={styles.chips}>
              {Object.keys(PRINT_PRICE).map((c) => <Chip key={c} label={c} on={currency === c} onPress={() => setCurrency(c)} />)}
            </View>
            <Text style={styles.total}>
              {formatMoney(PRINT_PRICE[currency as keyof typeof PRINT_PRICE] * qty, currency)}{' '}
              <Text style={styles.muted}>
                {t('({v} each, printed on 350gsm card with an envelope, postage included)', { v: formatMoney(PRINT_PRICE[currency as keyof typeof PRINT_PRICE], currency) })}
              </Text>
            </Text>
          </Section>

          <Section title={t('Post it to')}>
            <AddressFields value={address} onChange={setAddress} countries={PRINT_COUNTRIES} />
            <ErrorText>{error}</ErrorText>
            <Button label={t('Continue to payment')} busy={busy} disabled={!address.name || !address.line1 || !address.city || !address.postcode} onPress={order} />
          </Section>
        </>
      ) : (
        <>
          <Text style={styles.notice}>
            {t('Open the card and tap')} <Text style={{ fontWeight: '700' }}>{t('Use this card for a wish')}</Text> {t('or')}{' '}
            <Text style={{ fontWeight: '700' }}>{t('Print-ready PDF')}</Text> {t('first, so we have the finished pictures to print.')}
          </Text>
          <Button label={t('Open the editor on the website')} variant="secondary" onPress={() => openWebPage(DESIGN_EDITOR_PATH(id))} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  previewRow: { flexDirection: 'row', gap: 10 },
  page: { flex: 1, aspectRatio: 0.75, borderRadius: 10, backgroundColor: colors.surface },
  label: { fontSize: 14, color: colors.muted },
  muted: { color: colors.muted, fontSize: 14 },
  total: { fontSize: 18, fontWeight: '700', color: colors.text },
  notice: { color: colors.brand, fontSize: 14, lineHeight: 20 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
