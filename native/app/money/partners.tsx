import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { me } from '../../src/api/endpoints';
import { openWebPage } from '../../src/api/account';
import {
  CURRENCIES, addProduct, applyPartner, currencyFor, formatMoney, listPartnerships, parseAmount, requestPayout, updateSellerOrder,
  type PartnerKind, type Partnership
} from '../../src/api/money';
import { t } from '../../src/i18n';
import { Button, ErrorText, Field, Loading, Screen, Section, Title, colors } from '../../src/ui';
import { Chip, TestMode } from './shop';

const KINDS: { kind: PartnerKind; label: string }[] = [
  { kind: 'seller', label: 'Seller' }, { kind: 'designer', label: 'Card designer' }, { kind: 'charity', label: 'Charity' }
];
const STATUS: Record<string, string> = { pending: 'Waiting for review', approved: 'Approved', rejected: 'Not approved', suspended: 'Suspended' };

export default function PartnersScreen() {
  const [partners, setPartners] = useState<Partnership[] | null>(null);
  const [country, setCountry] = useState('IN');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    listPartnerships().then((r) => setPartners(r.partners)).catch((e) => setError(e instanceof Error ? e.message : t('Could not load')));
    me().then(({ user }) => setCountry(user.country ?? 'IN')).catch(() => undefined);
  }, []);
  useFocusEffect(load);

  async function payout(key: string, account: string, currency: string) {
    setBusy(key);
    setError(null);
    try {
      await requestPayout(account, currency);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Failed'));
    } finally {
      setBusy(null);
    }
  }

  if (!partners) return error ? <Screen><ErrorText>{error}</ErrorText></Screen> : <Loading />;

  return (
    <Screen>
      <View style={{ gap: 6 }}>
        <Title>{t('Sell, design or fundraise')}</Title>
        <Text style={styles.muted}>{t('Every account is reviewed by Blessly before it goes live.')}</Text>
      </View>
      <TestMode />
      <ErrorText>{error}</ErrorText>

      {KINDS.map(({ kind, label }) => {
        const m = partners.find((x) => x.partner.kind === kind);
        if (!m || m.partner.status === 'rejected') {
          return (
            <Section key={kind} title={t(label)}>
              {m ? (
                <Text style={styles.error}>
                  {t('Your application ({kind}) wasn’t approved.', { kind: t(label) })}
                  {m.partner.reviewNote ? ` ${m.partner.reviewNote}` : ''} {t('You can apply again.')}
                </Text>
              ) : null}
              <ApplyForm kind={kind} country={country} onDone={load} />
            </Section>
          );
        }
        const p = m.partner;
        return (
          <Section key={kind}>
            <View style={styles.head}>
              <Text style={styles.h2}>{t(label)}: {p.name}</Text>
              <Text style={[styles.badge, p.status === 'approved' && styles.badgeGreen]}>{t(STATUS[p.status] ?? p.status)}</Text>
            </View>

            {p.status === 'approved' ? (
              <View style={{ gap: 8 }}>
                <Text style={styles.small}>
                  {t('Balance:')}{' '}
                  {Object.entries(m.balance).map(([c, v]) => formatMoney(v, c)).join(' · ') || formatMoney(0, currencyFor(country))}
                </Text>
                {Object.entries(m.balance).filter(([, v]) => v > 0).map(([c, v]) => (
                  <Button
                    key={c}
                    label={t('Pay out {v}', { v: formatMoney(v, c) })}
                    variant="secondary"
                    busy={busy === `${p.id}${c}`}
                    onPress={() => payout(`${p.id}${c}`, `partner:${p.id}`, c)}
                  />
                ))}
              </View>
            ) : null}
            {m.payouts.length > 0 ? (
              <Text style={styles.small}>
                {t('Payouts:')} {m.payouts.map((x) => `${formatMoney(x.amount, x.currency)} ${x.status}`).join(' · ')}
              </Text>
            ) : null}

            {kind === 'seller' && p.status === 'approved' ? <SellerPanel m={m} currency={currencyFor(country)} onChanged={load} /> : null}

            {kind === 'designer' && p.status === 'approved' ? (
              <View style={{ gap: 10 }}>
                {/* Design files are uploaded from the website (the upload needs the browser's file picker). */}
                <Button label={t('Upload design on the website')} variant="secondary" onPress={() => openWebPage('/partners')} />
                <View style={styles.grid}>
                  {m.designs.map((d) => (
                    <View key={d.id} style={{ width: '31%', gap: 4 }}>
                      <Image source={{ uri: d.imageUrl }} style={styles.thumb} resizeMode="cover" accessibilityLabel={d.title} />
                      <Text style={styles.small}>{d.title} · {d.status === 'approved' ? t('used {uses}×', { uses: d.uses }) : d.status}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {kind === 'charity' && p.status === 'approved' ? (
              m.donations.length === 0 ? (
                <Text style={styles.small}>{t('No donations yet. Fundraisers can now choose {name}.', { name: p.name })}</Text>
              ) : (
                m.donations.map((d, i) => <Text key={i} style={styles.small}>{d.name} · {d.amount} · {d.fundraiser}</Text>)
              )
            ) : null}
          </Section>
        );
      })}
    </Screen>
  );
}

/* ---------------- Apply ---------------- */

function ApplyForm({ kind, country, onDone }: { kind: PartnerKind; country: string; onDone: () => void }) {
  const [v, setV] = useState({ name: '', country, website: '', regNumber: '', description: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = { seller: t('Sell gifts in the Blessly shop'), designer: t('Publish your card designs'), charity: t('Receive donations from fundraisers') }[kind];
  const nameLabel = kind === 'charity' ? t('Charity name') : kind === 'seller' ? t('Shop name') : t('Studio or artist name');
  const regLabel = kind === 'charity' ? t('Registration number') : t('Business registration / GST (optional)');

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await applyPartner({
        kind,
        name: v.name.trim(),
        country: v.country.trim().toUpperCase(),
        website: v.website.trim() || undefined,
        regNumber: kind !== 'designer' ? v.regNumber.trim() || undefined : undefined,
        description: v.description.trim() || undefined
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Could not apply'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 10 }}>
      <Text style={styles.bold}>{label}</Text>
      <Field label={nameLabel} value={v.name} onChangeText={(name) => setV({ ...v, name })} maxLength={120} />
      <Field label={t('Country code')} value={v.country} onChangeText={(c) => setV({ ...v, country: c.toUpperCase().slice(0, 2) })} autoCapitalize="characters" maxLength={2} />
      <Field label={t('Website (optional)')} value={v.website} onChangeText={(website) => setV({ ...v, website })} placeholder={t('https://')} autoCapitalize="none" keyboardType="url" />
      {kind !== 'designer' ? <Field label={regLabel} value={v.regNumber} onChangeText={(regNumber) => setV({ ...v, regNumber })} maxLength={80} /> : null}
      <Field label={t('About you')} value={v.description} onChangeText={(description) => setV({ ...v, description })} multiline maxLength={2000} numberOfLines={4} />
      <ErrorText>{error}</ErrorText>
      <Button label={t('Apply')} busy={busy} disabled={v.name.trim().length < 2} onPress={submit} />
    </View>
  );
}

/* ---------------- Seller: products and orders ---------------- */

type SellerM = Partnership;

function SellerPanel({ m, currency, onChanged }: { m: SellerM; currency: string; onChanged: () => void }) {
  return (
    <View style={{ gap: 12 }}>
      <Text style={styles.h3}>{t('Products')}</Text>
      {m.products.length === 0 ? <Text style={styles.small}>{t('No products yet.')}</Text> : null}
      {m.products.map((x) => (
        <View key={x.id} style={styles.line}>
          {x.imageUrl ? <Image source={{ uri: x.imageUrl }} style={styles.productImg} resizeMode="cover" /> : <Text style={{ fontSize: 24 }}>🎁</Text>}
          <View style={{ flex: 1 }}>
            <Text style={styles.bold}>{x.title}</Text>
            <Text style={styles.small}>
              {x.priceText} · {t('{n} in stock', { n: x.stock })} · {x.status === 'approved' ? t('live') : x.status === 'pending' ? t('waiting for review') : t('not approved')}
            </Text>
          </View>
        </View>
      ))}
      {/* Product photos are added on the website (the photo upload needs the browser's file picker). */}
      <Button label={t('Add product photos on the website')} variant="secondary" onPress={() => openWebPage('/partners')} />
      <AddProductForm currency={currency} onDone={onChanged} />

      <Text style={styles.h3}>{t('Orders to send')}</Text>
      {m.orders.length === 0 ? <Text style={styles.small}>{t('No orders yet.')}</Text> : null}
      {m.orders.map((o) => (
        <OrderRowView key={o.id} order={o} onChanged={onChanged} />
      ))}
    </View>
  );
}

function AddProductForm({ currency, onDone }: { currency: string; onDone: () => void }) {
  const [v, setV] = useState({ title: '', description: '', price: '', currency, stock: '10', countries: 'IN' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const price = parseAmount(v.price);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await addProduct({
        title: v.title.trim(),
        description: v.description.trim(),
        price: price ?? 0,
        currency: v.currency,
        stock: Number(v.stock),
        countries: v.countries
      });
      setV({ ...v, title: '', description: '', price: '' });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Could not add'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 10 }}>
      <Text style={styles.bold}>{t('Add a product')}</Text>
      <Field label={t('Product')} value={v.title} onChangeText={(title) => setV({ ...v, title })} maxLength={120} />
      <Field label={t('Price')} value={v.price} onChangeText={(price) => setV({ ...v, price })} keyboardType="decimal-pad" />
      <Text style={styles.label}>{t('Currency')}</Text>
      <View style={styles.chips}>
        {CURRENCIES.map((c) => <Chip key={c} label={c} on={v.currency === c} onPress={() => setV({ ...v, currency: c })} />)}
      </View>
      <Field label={t('In stock')} value={v.stock} onChangeText={(stock) => setV({ ...v, stock })} keyboardType="number-pad" />
      <Field label={t('Delivers to (country codes)')} value={v.countries} onChangeText={(c) => setV({ ...v, countries: c.toUpperCase().replace(/\s/g, '') })} placeholder="IN,GB" autoCapitalize="characters" />
      <Field label={t('Description')} value={v.description} onChangeText={(description) => setV({ ...v, description })} multiline maxLength={2000} numberOfLines={4} />
      <ErrorText>{error}</ErrorText>
      <Button label={t('Add product (sent for review)')} busy={busy} disabled={!v.title || price === null} onPress={submit} />
    </View>
  );
}

function OrderRowView({ order: o, onChanged }: { order: SellerM['orders'][number]; onChanged: () => void }) {
  const [tracking, setTracking] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const a = (o.details.address ?? {}) as Record<string, string>;
  const addr = [a.name, a.line1, a.line2, a.city, a.state, a.postcode, a.country].filter(Boolean).join(', ');

  async function send(status: 'shipped' | 'delivered') {
    setBusy(true);
    setError(null);
    try {
      await updateSellerOrder(o.id, status, tracking.trim());
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.line}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.bold}>{String(o.details.title ?? '')} · {o.amount}</Text>
        <Text style={styles.small}>{addr}</Text>
        {o.details.giftMessage ? <Text style={styles.small}>{t('Gift note: “{v}”', { v: String(o.details.giftMessage) })}</Text> : null}
        {o.status === 'paid' ? (
          <View style={{ gap: 8 }}>
            <Field label={t('Tracking number')} value={tracking} onChangeText={setTracking} maxLength={80} />
            <Button label={t('Mark shipped')} variant="secondary" busy={busy} onPress={() => send('shipped')} />
          </View>
        ) : null}
        {o.status === 'shipped' ? <Button label={t('Mark delivered')} variant="secondary" busy={busy} onPress={() => send('delivered')} /> : null}
        {o.status === 'delivered' ? <Text style={styles.badgeGreen}>{t('Delivered')}</Text> : null}
        <ErrorText>{error}</ErrorText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  small: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  bold: { fontSize: 15, fontWeight: '600', color: colors.text },
  label: { fontSize: 14, color: colors.muted },
  error: { color: colors.danger, fontSize: 14 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  h2: { fontSize: 18, fontWeight: '700', color: colors.text, flexShrink: 1 },
  h3: { fontSize: 16, fontWeight: '700', color: colors.text },
  badge: { fontSize: 12, color: colors.muted, borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8, overflow: 'hidden' },
  badgeGreen: { fontSize: 12, color: '#1f6b4f', borderWidth: 1, borderColor: '#1f6b4f', borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8, alignSelf: 'flex-start', overflow: 'hidden' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { width: '100%', aspectRatio: 0.75, borderRadius: 10, backgroundColor: colors.page },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  productImg: { width: 48, height: 48, borderRadius: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
