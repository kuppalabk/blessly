import { useCallback, useState } from 'react';
import { Alert, Image, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Button, ErrorText, Loading, Screen, Section, colors, styles as shared } from '../../src/ui';
import { t } from '../../src/i18n';
import { API_URL } from '../../src/config';
import { listWishlists } from '../../src/api/wishlists';
import {
  absUrl, addGuests, cancelCelebration, deleteCelebration, formFromRow, formatWhen, getCelebration, isPast, moderatePost,
  parseGuestLines, postUpdate, removeGuest, sendInvitations, sendThankYous, type Guest, type HostView,
} from '../../src/api/celebrations';
import { CelebrationForm } from './new';

type Tab = 'guests' | 'messages' | 'updates' | 'details';

const STATUS: Record<Guest['status'], string> = { invited: 'No answer yet', yes: 'Coming', no: 'Can’t come', maybe: 'Maybe' };
const errText = (e: unknown) => (e instanceof Error ? e.message : t('Something went wrong'));

/** The host's page for one celebration: guests, messages, updates and details. Same features as the website. */
export default function CelebrationHost() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [view, setView] = useState<HostView | null>(null);
  const [wishlists, setWishlists] = useState<{ id: string; title: string }[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('guests');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paste, setPaste] = useState('');
  const [update, setUpdate] = useState('');
  const [thanks, setThanks] = useState('');
  const [cancelNote, setCancelNote] = useState('');
  const [showCancel, setShowCancel] = useState(false);
  const [copied, setCopied] = useState(false);

  const reload = useCallback(async () => {
    const [v, lists] = await Promise.all([getCelebration(id), listWishlists().then((r) => r.wishlists).catch(() => [])]);
    setView(v);
    setWishlists(lists.map((w) => ({ id: w.id, title: w.title })));
    setThanks((prev) => prev || t('Thank you so much for being part of {title}. It meant a lot!', { title: v.celebration.title }));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      reload().then(() => setLoadError(null)).catch(() => setLoadError(t('Could not load this celebration.')));
    }, [reload]),
  );

  /** Runs an action, shows its message, then reloads the page. */
  async function run(key: string, fn: () => Promise<string | void>) {
    setBusy(key); setError(null); setNotice(null);
    try {
      const m = await fn();
      if (m) setNotice(m);
      await reload();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(null);
    }
  }

  function confirm(message: string, action: string, onYes: () => void) {
    Alert.alert(message, undefined, [
      { text: t('Not now'), style: 'cancel' },
      { text: action, style: 'destructive', onPress: onYes },
    ]);
  }

  if (!view) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('Celebration') }} />
        {loadError ? <ErrorText>{loadError}</ErrorText> : <Loading />}
      </Screen>
    );
  }

  const c = view.celebration;
  const past = isPast(c);
  const cancelled = !!c.cancelledAt;
  const link = `${API_URL}/c/${c.slug}`;
  const guestLink = (g: Guest) => `${link}?g=${g.token}`;
  const when = formatWhen(c.startsAt, c.timezone);
  const pending = view.posts.filter((p) => !p.approved).length;
  const uninvited = view.guests.filter((g) => g.email && !g.invitedAt).length;
  const place = [c.place, c.address].filter(Boolean).join(', ');
  const tabs: [Tab, string][] = [
    ['guests', `${t('Guests')} (${view.guests.length})`],
    ['messages', `${t('Messages')}${pending ? t(' ({pending} to approve)', { pending }) : ''}`],
    ['updates', t('Updates')],
    ['details', t('Details')],
  ];

  async function copyLink(text: string) {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const waGuest = (g: Guest) =>
    `https://wa.me/${(g.phone ?? '').replace(/[^\d]/g, '')}?text=${encodeURIComponent(
      t('Hi {name}! You’re invited: {title} — {when}. Details and RSVP: {link}', { name: g.name, title: c.title, when, link: guestLink(g) }),
    )}`;

  return (
    <Screen>
      <Stack.Screen options={{ title: c.title }} />
      <View style={{ gap: 2 }}>
        <Text style={s.muted}>{when}{place ? ` · ${place}` : ''}</Text>
      </View>

      <Section title={t('Summary')}>
        <View style={s.stats}>
          <Stat n={view.summary.headcount} label={t('coming')} />
          <Stat n={view.summary.maybe} label={t('maybe')} />
          <Stat n={view.summary.no} label={t('can’t come')} />
          <Stat n={view.summary.waiting} label={t('no answer')} />
        </View>
        <View style={s.linkBox}>
          <Text selectable style={s.link} numberOfLines={1}>{link}</Text>
          <Mini label={copied ? t('Copied') : t('Copy')} onPress={() => copyLink(link)} />
        </View>
        <View style={s.wrap}>
          <Mini label={t('View page')} onPress={() => Linking.openURL(link)} />
          {c.visibility !== 'invite' && (
            <Mini label={t('Share on WhatsApp')} onPress={() => Linking.openURL(`https://wa.me/?text=${encodeURIComponent(`${c.title} — ${when}. Details and RSVP: ${link}`)}`)} />
          )}
          <Mini label={t('Add to my calendar')} onPress={() => Linking.openURL(`${link}/calendar.ics`)} />
        </View>
        {c.visibility === 'invite' && <Text style={s.muted}>{t('Invited guests only — share each guest’s personal link (Guests tab), not this one.')}</Text>}
        {cancelled && <Text style={s.notice}>{t('This celebration is cancelled.')}</Text>}
      </Section>

      <View style={s.tabs} accessibilityRole="tablist">
        {tabs.map(([k, label]) => (
          <Pressable key={k} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} style={[s.tab, tab === k && s.tabOn]}>
            <Text style={[s.tabText, tab === k && s.tabTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {notice ? <Text style={s.notice} accessibilityRole="alert">{notice}</Text> : null}
      <ErrorText>{error}</ErrorText>

      {tab === 'guests' && (
        <View style={{ gap: 16 }}>
          <Section>
            <Text style={s.label}>{t('Add guests — one per line: name, then email and/or phone')}</Text>
            <TextInput
              style={[shared.input, s.multi]} multiline value={paste} onChangeText={setPaste}
              placeholder={t('Meena Shah, meena@example.com\nTom +44 7700 900123')}
            />
            <View style={s.wrap}>
              <Button label={t('Add guests')} variant="secondary" busy={busy === 'add'} disabled={!paste.trim()} onPress={() => {
                const guests = parseGuestLines(paste);
                if (!guests.length) return;
                void run('add', async () => {
                  await addGuests(c.id, guests);
                  setPaste('');
                  return guests.length === 1 ? t('Added {n} guest', { n: 1 }) : t('Added {n} guests', { n: guests.length });
                });
              }} />
            </View>
            <Button
              label={uninvited ? t('Email invitations') + ` (${uninvited})` : t('Email invitations')}
              busy={busy === 'invite'} disabled={!!busy || !uninvited}
              onPress={() => void run('invite', async () => {
                const r = await sendInvitations(c.id);
                return r.emailed === 1 ? t('Invitations emailed to {n} guest', { n: 1 }) : t('Invitations emailed to {n} guests', { n: r.emailed });
              })}
            />
          </Section>

          {(view.summary.diets.length > 0 || view.summary.access.length > 0) && (
            <Section title={t('Needs to plan for')}>
              {view.summary.diets.map((d) => <Text key={'d' + d.name} style={s.small}>{d.name}: {d.diet}</Text>)}
              {view.summary.access.map((a) => <Text key={'a' + a.name} style={s.small}>{a.name}: {a.access}</Text>)}
            </Section>
          )}

          {view.guests.length === 0 ? (
            <Text style={s.muted}>
              {t('No guests yet. Add them above')}{c.visibility !== 'invite' ? t(', or share the link — people who reply are added automatically') : ''}.
            </Text>
          ) : (
            <Section>
              {view.guests.map((g) => (
                <View key={g.id} style={s.guest}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={s.bold}>{g.name}{g.partySize > 1 && g.status === 'yes' ? ` +${g.partySize - 1}` : ''}</Text>
                    <Text style={s.muted}>{[g.email, g.phone].filter(Boolean).join(' · ') || (g.selfAdded ? t('Replied from the link') : '—')}</Text>
                    {g.note ? <Text style={s.small}>“{g.note}”</Text> : null}
                    <Text style={[s.badge, g.status === 'yes' && s.badgeGreen]}>{t(STATUS[g.status])}</Text>
                  </View>
                  <View style={s.minis}>
                    {g.email && <Mini label={g.invitedAt ? t('Resend') : t('Email')} disabled={!!busy} onPress={() => void run('re' + g.id, async () => {
                      await sendInvitations(c.id, [g.id]);
                      return t('Invitation sent to {name}', { name: g.name });
                    })} />}
                    {g.phone && <Mini label={t('WhatsApp')} onPress={() => Linking.openURL(waGuest(g))} />}
                    <Mini label={t('Copy link')} onPress={() => void Clipboard.setStringAsync(guestLink(g))} />
                    <Mini label={t('Remove')} danger disabled={!!busy} onPress={() => void run('rm' + g.id, async () => { await removeGuest(c.id, g.id); })} />
                  </View>
                </View>
              ))}
            </Section>
          )}
        </View>
      )}

      {tab === 'messages' && (
        <View style={{ gap: 12 }}>
          {view.posts.length === 0 && <Text style={s.muted}>{t('No messages yet. Guests can leave messages, photos and videos on the page.')}</Text>}
          {view.posts.map((p) => (
            <View key={p.id} style={s.card}>
              {p.media?.kind === 'image' && (
                <Image source={{ uri: absUrl(p.media.url) }} style={s.photo} resizeMode="cover" accessibilityLabel={t('Photo from {name}', { name: p.name })} />
              )}
              {p.media?.kind === 'video' && (
                <Mini label={t('Play video')} onPress={() => Linking.openURL(absUrl(p.media!.url))} />
              )}
              {p.message ? <Text style={s.body}>{p.message}</Text> : null}
              <Text style={s.muted}>— {p.name}{p.kind === 'memory' ? t(' · memory') : ''}{!p.approved ? t(' · waiting for approval') : ''}</Text>
              <View style={s.wrap}>
                {!p.approved && <Mini label={t('Approve')} disabled={!!busy} onPress={() => void run('ap' + p.id, () => moderatePost(c.id, p.id, 'approve').then(() => undefined))} />}
                <Mini label={t('Delete')} danger disabled={!!busy} onPress={() => void run('del' + p.id, () => moderatePost(c.id, p.id, 'delete').then(() => undefined))} />
              </View>
            </View>
          ))}
        </View>
      )}

      {tab === 'updates' && (
        <View style={{ gap: 16 }}>
          {!cancelled && (
            <Section>
              <Text style={s.label}>{t('Post an update (shown on the page and emailed to guests who haven’t said no)')}</Text>
              <TextInput
                style={[shared.input, s.multi]} multiline maxLength={2000} value={update} onChangeText={setUpdate}
                placeholder={t('e.g. We’ve moved inside — same address, back door.')}
              />
              <Button label={t('Post update')} variant="secondary" busy={busy === 'upd'} disabled={update.trim().length < 3} onPress={() => void run('upd', async () => {
                const r = await postUpdate(c.id, update);
                setUpdate('');
                return r.update.emailed === 1 ? t('Update posted and emailed to {n} guest', { n: 1 }) : t('Update posted and emailed to {n} guests', { n: r.update.emailed });
              })} />
            </Section>
          )}

          {view.updates.length > 0 && (
            <Section>
              {view.updates.map((u) => (
                <View key={u.id} style={s.updateRow}>
                  <Text style={s.body}>{u.body}</Text>
                  <Text style={s.muted}>{t('{v} · emailed {emailed}', { v: formatWhen(u.createdAt, c.timezone), emailed: u.emailed })}</Text>
                </View>
              ))}
            </Section>
          )}

          {past && (
            <Section>
              <Text style={s.label}>{t('Thank your guests (everyone who came or left a message, once)')}</Text>
              <TextInput style={[shared.input, s.multi]} multiline maxLength={2000} value={thanks} onChangeText={setThanks} />
              <Button label={t('Send thank-yous')} variant="secondary" busy={busy === 'thx'} onPress={() => void run('thx', async () => {
                const r = await sendThankYous(c.id, thanks);
                return r.emailed === 1 ? t('Thank-you sent to {n} guest', { n: 1 }) : t('Thank-you sent to {n} guests', { n: r.emailed });
              })} />
            </Section>
          )}

          {!cancelled && !past && (
            <Section>
              {!showCancel ? (
                <Button label={t('Cancel the celebration')} variant="secondary" onPress={() => setShowCancel(true)} />
              ) : (
                <View style={{ gap: 10 }}>
                  <Text style={s.bold}>{t('Cancel the celebration')}</Text>
                  <Text style={s.label}>{t('Message to guests (optional)')}</Text>
                  <TextInput style={shared.input} value={cancelNote} onChangeText={setCancelNote} maxLength={1000} />
                  <Button label={t('Cancel and tell guests')} variant="danger" busy={busy === 'cancel'} onPress={() =>
                    confirm(t('Cancel and tell your guests?'), t('Cancel and tell guests'), () => void run('cancel', async () => {
                      await cancelCelebration(c.id, cancelNote);
                      setShowCancel(false);
                      return t('Cancelled — guests have been told.');
                    }))} />
                </View>
              )}
            </Section>
          )}

          <Button
            label={t('Delete page')} variant="secondary" busy={busy === 'delete'}
            onPress={() => confirm(t('Delete this celebration page, its guest list and all messages? This can’t be undone.'), t('Delete page'), () => {
              setBusy('delete');
              deleteCelebration(c.id)
                .then(() => router.replace('/celebrations'))
                .catch((e) => setError(errText(e)))
                .finally(() => setBusy(null));
            })}
          />
        </View>
      )}

      {tab === 'details' && (
        <CelebrationForm
          initial={formFromRow(c)} id={c.id} wishlists={wishlists}
          onSaved={() => { setNotice(t('Saved')); void reload(); }}
        />
      )}
      <View style={{ height: 8 }} />
    </Screen>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statN}>{n}</Text>
      <Text style={s.muted}>{label}</Text>
    </View>
  );
}

function Mini({ label, onPress, disabled, danger }: { label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <Pressable
      onPress={onPress} disabled={disabled} accessibilityRole="button"
      style={({ pressed }) => [s.mini, disabled && { opacity: 0.5 }, pressed && { opacity: 0.7 }]}
    >
      <Text style={[s.miniText, danger && { color: colors.danger }]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  muted: { fontSize: 14, color: colors.muted },
  small: { fontSize: 14, color: colors.text },
  label: { fontSize: 14, color: colors.muted },
  bold: { fontSize: 15, fontWeight: '600', color: colors.text },
  body: { fontSize: 15, color: colors.text, lineHeight: 21 },
  notice: { fontSize: 14, color: colors.brand, fontWeight: '600' },
  multi: { minHeight: 90, textAlignVertical: 'top' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  stats: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'center', flex: 1 },
  statN: { fontSize: 22, fontWeight: '700', color: colors.text },
  linkBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 10, backgroundColor: colors.page },
  link: { flex: 1, fontSize: 13, color: colors.text },
  mini: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  miniText: { fontSize: 13, fontWeight: '600', color: colors.brand },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tab: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  tabOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  tabText: { fontSize: 14, color: colors.text },
  tabTextOn: { color: '#fff' },
  guest: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  minis: { gap: 6, alignItems: 'flex-end' },
  badge: { alignSelf: 'flex-start', fontSize: 12, fontWeight: '600', color: colors.muted, backgroundColor: colors.page, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 999, overflow: 'hidden' },
  badgeGreen: { color: '#1F7A4D' },
  card: { backgroundColor: colors.surface, borderRadius: 14, padding: 14, gap: 8 },
  photo: { width: '100%', height: 220, borderRadius: 10 },
  updateRow: { gap: 4, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
});
