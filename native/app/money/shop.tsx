import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { me } from '../../src/api/endpoints';
import { blankAddress, buyProduct, listShop, openPayment, type Address, type ShopProduct } from '../../src/api/money';
import { t } from '../../src/i18n';
import { Button, Empty, ErrorText, Field, Loading, Screen, Title, colors } from '../../src/ui';

/** The address fields used by the shop and by printed cards. Countries are shown as chips. */
export function AddressFields({ value, onChange, countries }: { value: Address; onChange: (a: Address) => void; countries: string[] }) {
  const set = (k: keyof Address) => (v: string) => onChange({ ...value, [k]: v });
  return (
    <View style={{ gap: 10 }}>
      <Field label={t('Recipient’s name')} value={value.name} onChangeText={set('name')} autoComplete="name" maxLength={80} />
      <Field label={t('Address line 1')} value={value.line1} onChangeText={set('line1')} autoComplete="street-address" maxLength={120} />
      <Field label={t('Address line 2 (optional)')} value={value.line2} onChangeText={set('line2')} maxLength={120} />
      <Field label={t('Town or city')} value={value.city} onChangeText={set('city')} autoComplete="postal-address-locality" maxLength={80} />
      <Field label={t('State / county (optional)')} value={value.state} onChangeText={set('state')} maxLength={80} />
      <Field label={t('Postcode / PIN')} value={value.postcode} onChangeText={set('postcode')} autoComplete="postal-code" maxLength={12} />
      <View style={{ gap: 6 }}>
        <Text style={styles.label}>{t('Country')}</Text>
        <View style={styles.chips}>
          {countries.map((c) => (
            <Chip key={c} label={c} on={value.country === c} onPress={() => onChange({ ...value, country: c })} />
          ))}
        </View>
      </View>
      <Field label={t('Phone for the courier (optional)')} value={value.phone} onChangeText={set('phone')} keyboardType="phone-pad" maxLength={20} />
    </View>
  );
}

export function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

export default function ShopScreen() {
  const [products, setProducts] = useState<ShopProduct[] | null>(null);
  const [country, setCountry] = useState('IN');
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [address, setAddress] = useState<Address>(blankAddress('IN'));
  const [gift, setGift] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(() => {
    me().then(({ user }) => {
      setCountry(user.country ?? 'IN');
      setAddress((a) => (a.name ? a : { ...a, country: user.country ?? 'IN' }));
    }).catch(() => undefined);
    listShop().then((r) => setProducts(r.products)).catch((e) => setError(e instanceof Error ? e.message : t('Could not load the shop')));
  }, []);
  useFocusEffect(load);

  function open(p: ShopProduct) {
    setOpenId(openId === p.id ? null : p.id);
    setQty(1);
    setGift('');
    setDone(null);
    setError(null);
    setAddress((a) => ({ ...a, country: p.countries.includes(country) ? country : p.countries[0] }));
  }

  async function buy(p: ShopProduct) {
    setBusy(true);
    setError(null);
    try {
      const { checkoutUrl } = await buyProduct({ productId: p.id, quantity: qty, address, giftMessage: gift.trim() || null });
      await openPayment(checkoutUrl);
      setDone(t('If you finished paying, your order appears in My orders.'));
      router.push('/money/orders');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Something went wrong'));
    } finally {
      setBusy(false);
    }
  }

  if (!products) return error ? <Screen><ErrorText>{error}</ErrorText></Screen> : <Loading />;

  return (
    <Screen>
      <View style={{ gap: 6 }}>
        <Title>{t('Shop')}</Title>
        <Text style={styles.muted}>{t('Gifts from independent sellers, reviewed by Blessly and delivered by the seller.')}</Text>
      </View>
      <TestMode />
      {products.length === 0 ? <Empty text={t('No products yet.')} /> : null}
      {products.map((p) => {
        const isOpen = openId === p.id;
        return (
          <View key={p.id} style={styles.card}>
            {p.imageUrl ? (
              <Image source={{ uri: p.imageUrl }} style={styles.image} resizeMode="cover" accessibilityLabel={p.title} />
            ) : (
              <View style={[styles.image, styles.placeholder]}><Text style={{ fontSize: 48 }}>🎁</Text></View>
            )}
            <Text style={styles.title}>{p.title}</Text>
            <Text style={styles.muted}>{t('{seller} · delivers to {v}', { seller: p.seller, v: p.countries.join(', ') })}</Text>
            {p.description ? <Text style={styles.body}>{p.description}</Text> : null}
            <View style={styles.priceRow}>
              <Text style={styles.price}>{p.price}</Text>
              <Text style={styles.muted}>{t('{stock} left', { stock: p.stock })}</Text>
            </View>

            {!isOpen ? (
              <Button label={t('Buy')} variant="secondary" onPress={() => open(p)} />
            ) : (
              <View style={{ gap: 10 }}>
                <Text style={styles.label}>{t('Quantity')}</Text>
                <View style={styles.chips}>
                  {Array.from({ length: Math.min(p.stock, 10) }, (_, i) => i + 1).map((n) => (
                    <Chip key={n} label={String(n)} on={qty === n} onPress={() => setQty(n)} />
                  ))}
                </View>
                <AddressFields value={address} onChange={setAddress} countries={p.countries} />
                <Field label={t('Gift note (optional)')} value={gift} onChangeText={setGift} maxLength={300} />
                <ErrorText>{error}</ErrorText>
                <Button label={t('Continue to payment')} busy={busy} disabled={!address.name || !address.line1 || !address.city || !address.postcode} onPress={() => buy(p)} />
                <Button label={t('Cancel')} variant="secondary" onPress={() => setOpenId(null)} />
              </View>
            )}
          </View>
        );
      })}
      {done ? <Text style={styles.notice}>{done}</Text> : null}
      <ErrorText>{openId ? null : error}</ErrorText>
    </Screen>
  );
}

export function TestMode() {
  return (
    <View style={styles.test}>
      <Text style={styles.testText}>
        <Text style={{ fontWeight: '700' }}>{t('Test mode.')}</Text> {t('No real money moves — payments use a pretend checkout.')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  body: { color: colors.text, fontSize: 14, lineHeight: 20 },
  label: { fontSize: 14, color: colors.muted },
  notice: { color: colors.brand, fontSize: 14, lineHeight: 20 },
  test: { backgroundColor: '#efeafc', borderRadius: 12, padding: 12 },
  testText: { color: colors.brand, fontSize: 14, lineHeight: 20 },
  card: { backgroundColor: colors.surface, borderRadius: 14, padding: 14, gap: 8 },
  image: { width: '100%', aspectRatio: 1, borderRadius: 12 },
  placeholder: { backgroundColor: colors.page, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  price: { fontSize: 16, fontWeight: '700', color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: colors.page },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontSize: 14, color: colors.text },
  chipTextOn: { color: '#fff', fontWeight: '600' },
});
