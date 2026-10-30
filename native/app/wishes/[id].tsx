import { useEffect, useState } from 'react';
import { Linking, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { me } from '../../src/api/endpoints';
import { API_URL } from '../../src/config';
import {
  cancelSend, Channel, facebookLink, getWish, linkedinLink, LANGUAGES, mailtoLink, normalizePhone, OCCASIONS, publishWishPage,
  scheduleSend, shareMessage, smsLink, telegramLink, whatsappLink, WishDetail, xLink,
} from '../../src/api/wishes';
import { Button, ErrorText, Field, Loading, Screen, Section, colors } from '../../src/ui';
import { Chip } from '../people/new';
import { t } from '../../src/i18n';

const CHANNEL_LABEL: { id: Channel; label: string }[] = [
  { id: 'email', label: 'Email (sent automatically)' },
  { id: 'whatsapp', label: 'WhatsApp (we remind you to send)' },
  { id: 'telegram', label: 'Telegram (we remind you to send)' },
  { id: 'sms', label: 'SMS (we remind you to send)' },
];

/** Default time for a new scheduled send: tomorrow at 09:00 on the device. */
function defaultWhen() {
  const d = new Date(Date.now() + 24 * 3600000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} 09:00`;
}

const errMsg = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export default function WishScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<WishDetail | null>(null);
  const [country, setCountry] = useState('IN');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [channel, setChannel] = useState<Channel>('whatsapp');
  const [recipient, setRecipient] = useState('');
  const [when, setWhen] = useState(defaultWhen);
  const [busy, setBusy] = useState<'schedule' | 'page' | null>(null);

  const refresh = () => getWish(id).then(setData);

  useEffect(() => {
    Promise.all([getWish(id), me()])
      .then(([d, m]) => {
        const cc = m.user.country ?? 'IN';
        setCountry(cc);
        setData(d);
        // Pre-fill the channel from the person's details, as the website does.
        const email = d.person?.email ?? null;
        const phone = normalizePhone(d.person?.phone, cc);
        setChannel(email ? 'email' : 'whatsapp');
        setRecipient(email ?? phone ?? '');
      })
      .catch((e) => setError(errMsg(e, t('Could not load this wish.'))));
  }, [id]);

  const back = (
    <Pressable accessibilityRole="button" accessibilityLabel={t('Back to home')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={styles.back}>
      <Text style={styles.backText}>‹</Text>
    </Pressable>
  );

  if (!data) return <Screen scroll={false}>{error ? <ErrorText>{error}</ErrorText> : <Loading />}</Screen>;

  const { wish, person, sends, page } = data;
  const pageUrl = page ? `${API_URL}/w/${page.slug}` : null;
  const message = shareMessage(wish.text, pageUrl);
  const phone = normalizePhone(person?.phone, country);
  const email = person?.email ?? null;
  const occasion = OCCASIONS.find((o) => o.id === wish.occasion)?.label ?? wish.occasion;
  const rtl = LANGUAGES.find((l) => l.code === wish.language)?.rtl ?? false;

  async function open(url: string) {
    setError(null);
    await Linking.openURL(url).catch(() => setError(t('Could not open that app.')));
  }

  async function schedule() {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})$/.exec(when.trim());
    const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])) : null;
    if (!m || !d || Number.isNaN(d.getTime()) || d.getDate() !== Number(m[3])) {
      setError(t('Enter the time as YYYY-MM-DD HH:MM'));
      return;
    }
    setBusy('schedule'); setError(null); setNotice(null);
    try {
      await scheduleSend(wish.id, channel, channel === 'telegram' ? '' : recipient, d);
      await refresh();
      setNotice(t('Scheduled'));
    } catch (e) {
      setError(errMsg(e, t('Could not schedule')));
    } finally {
      setBusy(null);
    }
  }

  async function cancel(sendId: string) {
    setError(null);
    try {
      await cancelSend(sendId);
      await refresh();
    } catch (e) {
      setError(errMsg(e, t('Could not cancel')));
    }
  }

  async function createPage() {
    setBusy('page'); setError(null);
    try {
      const res = await publishWishPage(wish.id);
      setData((d) => (d ? { ...d, page: res.page } : d));
    } catch (e) {
      setError(errMsg(e, t('Could not create the wish page.')));
    } finally {
      setBusy(null);
    }
  }

  const links = [
    { label: 'WhatsApp', sub: phone ? t('To {name}', { name: wish.recipientName }) : t('Choose a chat'), url: whatsappLink(message, phone) },
    { label: 'Telegram', sub: t('Choose a chat'), url: telegramLink(wish.text, pageUrl ?? '') },
    { label: 'SMS', sub: phone ? t('To {name}', { name: wish.recipientName }) : t('Choose a contact'), url: smsLink(message, phone) },
    { label: t('Email'), sub: email ? t('To {name}', { name: email }) : t('Choose an address'), url: mailtoLink(message, t('A wish for you, {name}', { name: wish.recipientName }), email) },
  ];

  return (
    <Screen>
      <View style={styles.header}>
        {back}
        <Text style={styles.h1}>{t('Send to {recipientName}', { recipientName: wish.recipientName })}</Text>
      </View>

      <Section>
        <Text style={styles.eyebrow}>{t(occasion)}</Text>
        <Text style={[styles.wishText, { textAlign: rtl ? 'right' : 'left' }]}>{wish.text}</Text>
      </Section>

      <Section title={t('Send now')}>
        <Text style={styles.hint}>{t("Opens your own app with the message ready. You tap send, so it comes from you.")}</Text>
        <View style={styles.grid}>
          {links.map((l) => (
            <Pressable key={l.label} accessibilityRole="button" onPress={() => open(l.url)} style={styles.tile}>
              <Text style={styles.tileTitle}>{l.label}</Text>
              <Text style={styles.hint}>{l.sub}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.wrap}>
          <Button label={t('Share message')} variant="secondary" onPress={() => Share.share({ message }).catch(() => undefined)} />
          {pageUrl && <Button label={t('Preview wish page')} variant="secondary" onPress={() => open(pageUrl)} />}
        </View>
        {pageUrl ? (
          <>
            <Text style={styles.hint}>{t('Friends and family can add their own messages on the wish page:')}</Text>
            <Text selectable style={styles.link}>{pageUrl}</Text>
            <Text style={styles.label}><Text style={styles.bold}>{t('Post on social media')}</Text>{` ${t('— shares the wish page with its card preview')}`}</Text>
            <View style={styles.wrap}>
              <Button label={t('Facebook')} variant="secondary" onPress={() => open(facebookLink(pageUrl))} />
              <Button label={t('LinkedIn')} variant="secondary" onPress={() => open(linkedinLink(pageUrl))} />
              <Button label="X" variant="secondary" onPress={() => open(xLink(wish.text, pageUrl))} />
              <Button
                label={t('More apps (Instagram…)')}
                variant="secondary"
                onPress={() => Share.share({ title: t('A wish for {name}', { name: wish.recipientName }), message }).catch(() => undefined)}
              />
            </View>
            <Text style={styles.hint}>{t('Instagram doesn’t accept links from websites. On your phone use “More apps”, or copy the message and paste it into an Instagram chat.')}</Text>
          </>
        ) : (
          <Button label={t('Create wish page')} variant="secondary" busy={busy === 'page'} onPress={createPage} />
        )}
      </Section>

      <Section title={t('Or schedule')}>
        <Text style={styles.label}>{t('How')}</Text>
        <View style={styles.wrap}>
          {CHANNEL_LABEL.map((c) => (
            <Chip
              key={c.id}
              label={t(c.label)}
              selected={channel === c.id}
              onPress={() => { setChannel(c.id); setRecipient(c.id === 'email' ? email ?? '' : phone ?? ''); }}
            />
          ))}
        </View>
        {channel !== 'telegram' && (
          <Field
            label={channel === 'email' ? t('Their email') : t('Their mobile')}
            value={recipient}
            onChangeText={setRecipient}
            keyboardType={channel === 'email' ? 'email-address' : 'phone-pad'}
            autoCapitalize="none"
            autoCorrect={false}
          />
        )}
        <Field label={t("When (your device's time)")} hint="YYYY-MM-DD HH:MM" value={when} onChangeText={setWhen} />
        <Button label={t('Schedule')} busy={busy === 'schedule'} onPress={schedule} />
        {notice && <Text style={styles.hint}>{notice}</Text>}
      </Section>

      {sends.length > 0 && (
        <Section title={t('Scheduled')}>
          {sends.map((s) => (
            <View key={s.id} style={styles.send}>
              <View style={{ flex: 1 }}>
                <Text style={styles.tileTitle}>{`${s.channel.charAt(0).toUpperCase()}${s.channel.slice(1)} · ${new Date(s.sendAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}</Text>
                <Text style={styles.hint}>{s.recipient}</Text>
              </View>
              {s.status === 'scheduled'
                ? <Button label={t('Cancel')} variant="secondary" onPress={() => cancel(s.id)} />
                : <Text style={styles.status}>{s.status}</Text>}
            </View>
          ))}
        </Section>
      )}

      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  backText: { fontSize: 28, color: colors.brand, marginTop: -4 },
  h1: { fontSize: 22, fontWeight: '700', color: colors.text, flexShrink: 1 },
  eyebrow: { fontSize: 13, fontWeight: '700', color: colors.brand, textTransform: 'uppercase' },
  wishText: { fontSize: 17, lineHeight: 25, color: colors.text },
  label: { fontSize: 14, color: colors.muted },
  bold: { fontWeight: '700', color: colors.text },
  hint: { fontSize: 13, color: colors.muted },
  link: { fontSize: 14, color: colors.brand },
  status: { fontSize: 13, color: colors.muted, textTransform: 'capitalize' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '48%', flexGrow: 1, backgroundColor: colors.page, borderRadius: 12, padding: 12, gap: 4 },
  tileTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  send: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
});
