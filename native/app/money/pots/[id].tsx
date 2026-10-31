import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Share, StyleSheet, Text, View } from 'react-native';
import { webUrl } from '../../../src/api/account';
import { closePot, formatMoney, getPot, requestPayout, type PotDetail } from '../../../src/api/money';
import { t } from '../../../src/i18n';
import { Button, ErrorText, Loading, Screen, Section, Title, colors } from '../../../src/ui';
import { TestMode } from '../shop';

export default function PotScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [pot, setPot] = useState<PotDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    getPot(id).then(setPot).catch((e) => setError(e instanceof Error ? e.message : t('Not found')));
  }, [id]);
  useFocusEffect(load);

  async function run(key: string, fn: () => Promise<string>) {
    setBusy(key);
    setError(null);
    setMsg(null);
    try {
      setMsg(await fn());
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Failed'));
    } finally {
      setBusy(null);
    }
  }

  if (!pot) return error ? <Screen><ErrorText>{error}</ErrorText></Screen> : <Loading />;

  const c = pot.collection;
  const link = webUrl(`/p/${c.slug}`);
  const pct = c.target ? Math.min(100, Math.round((pot.raised / c.target) * 100)) : null;
  const who = pot.contributions.length;
  const shareText = `${c.title} — chip in here: ${link}`;

  return (
    <Screen>
      <Title>{c.title}</Title>
      <TestMode />

      <Section>
        <Text style={styles.big}>
          {who === 1
            ? t('{raised} raised from {n} person', { raised: formatMoney(pot.raised, c.currency), n: 1 })
            : t('{raised} raised from {n} people', { raised: formatMoney(pot.raised, c.currency), n: who })}
          {c.target ? ` · ${t('target {v}', { v: formatMoney(c.target, c.currency) })}` : ''}
        </Text>
        {pct !== null ? (
          <View style={styles.bar} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }}>
            <View style={[styles.fill, { width: `${pct}%` }]} />
          </View>
        ) : null}

        <View style={styles.linkBox}>
          <Text selectable style={styles.link} numberOfLines={1}>{link}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Button label={t('Share link')} variant="secondary" onPress={() => Share.share({ message: shareText }).catch(() => undefined)} />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={t('WhatsApp')}
              variant="secondary"
              onPress={() => Linking.openURL(`https://wa.me/?text=${encodeURIComponent(shareText)}`).catch(() => undefined)}
            />
          </View>
        </View>

        {pot.charity ? (
          <Text style={styles.small}>
            {t('Donations go directly to')} <Text style={{ fontWeight: '700' }}>{pot.charity.name}</Text>.
          </Text>
        ) : (
          <View style={{ gap: 8 }}>
            {Object.entries(pot.balance).filter(([, v]) => v > 0).map(([cur, v]) => (
              <Button
                key={cur}
                label={t('Pay out {v}', { v: formatMoney(v, cur) })}
                variant="secondary"
                busy={busy === 'p' + cur}
                disabled={!!busy}
                onPress={() => run('p' + cur, async () => {
                  await requestPayout(`collection:${id}`, cur);
                  return t('Payout of {amount} requested (test mode).', { amount: formatMoney(v, cur) });
                })}
              />
            ))}
            {!c.closedAt ? (
              <Button
                label={t('Close collection')}
                variant="secondary"
                busy={busy === 'close'}
                disabled={!!busy}
                onPress={() => run('close', async () => {
                  await closePot(id);
                  return t('Closed to new contributions.');
                })}
              />
            ) : null}
          </View>
        )}

        {msg ? <Text style={styles.notice}>{msg}</Text> : null}
        <ErrorText>{error}</ErrorText>

        {pot.payouts.length > 0 ? (
          <View style={{ gap: 4 }}>
            {pot.payouts.map((p) => (
              <Text key={p.id} style={styles.small}>
                {formatMoney(p.amount, p.currency)} · {p.status}{p.reference ? t(' · ref {reference}', { reference: p.reference }) : ''} · {new Date(p.createdAt).toLocaleDateString()}
              </Text>
            ))}
          </View>
        ) : null}
      </Section>

      <Section title={t('Contributions')}>
        {pot.contributions.length === 0 ? (
          <Text style={styles.small}>{t('None yet — share the link.')}</Text>
        ) : (
          pot.contributions.map((x) => (
            <View key={x.id} style={styles.row}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.name}>
                  {x.name}{x.anonymous ? t(' (anonymous to others)') : ''}
                </Text>
                <Text style={styles.small}>{x.email}</Text>
                {x.message ? <Text style={styles.small}>{x.message}</Text> : null}
              </View>
              <Text style={styles.amount}>{formatMoney(x.amount, x.currency)}</Text>
            </View>
          ))
        )}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  big: { fontSize: 20, color: colors.text, fontWeight: '600' },
  bar: { height: 10, borderRadius: 999, backgroundColor: colors.page, overflow: 'hidden' },
  fill: { height: 10, backgroundColor: colors.brand },
  linkBox: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 10 },
  link: { color: colors.text, fontSize: 14 },
  small: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  notice: { color: colors.brand, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  name: { fontSize: 15, fontWeight: '600', color: colors.text },
  amount: { fontSize: 15, fontWeight: '700', color: colors.text },
});
