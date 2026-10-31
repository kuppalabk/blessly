import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { t } from '../../../src/i18n';
import { Button, ErrorText, Loading, Section, Title, colors } from '../../../src/ui';
import { formatCalDate, fromISO, todayLocal, toISO } from '../../../src/api/calendar';
import {
  deleteEvent, errorMessage, getEvent, getFamily, openLink, setRsvp, startGroupCard,
  type EventView, type RsvpStatus,
} from '../../../src/api/family';
import { Avatar, Badge, Disclosure, EventForm, MiniButton, TaskBoard, familyStyles as fs } from '../../family/[id]';

const RSVP_LABEL = { going: 'Going', maybe: 'Maybe', no: 'Can’t go' } as const;
const RSVP_OPTIONS: RsvpStatus[] = ['going', 'maybe', 'no'];

type Loaded = { ev: EventView; userId: string; people: { id: string; name: string }[] };

export default function FamilyEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rsvpError, setRsvpError] = useState<string | null>(null);
  const [cardBusy, setCardBusy] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);

  const load = useCallback(() => {
    getEvent(id)
      .then(async (ev) => {
        // The circle gives us the caller's id (for "you") and the shared people for the edit form.
        const fam = await getFamily(ev.event.familyId);
        setData({ ev, userId: fam.me.userId, people: fam.shared.map((p) => ({ id: p.id, name: p.name })) });
        setError(null);
      })
      .catch((e) => setError(errorMessage(e, t('Could not load the event.'))));
  }, [id]);
  useFocusEffect(load);

  async function pick(status: RsvpStatus) {
    if (!data) return;
    const before = data.ev.me.rsvp;
    setData({ ...data, ev: { ...data.ev, me: { ...data.ev.me, rsvp: status } } });
    setRsvpError(null);
    try {
      await setRsvp(id, status);
      load();
    } catch (e) {
      setData((d) => (d ? { ...d, ev: { ...d.ev, me: { ...d.ev.me, rsvp: before } } } : d));
      setRsvpError(errorMessage(e, t('Could not save')));
    }
  }

  async function startCard() {
    setCardBusy(true);
    setCardError(null);
    try {
      await startGroupCard(id);
      load();
    } catch (e) {
      setCardError(errorMessage(e, t('Could not start the card')));
    }
    setCardBusy(false);
  }

  if (!data) {
    return <View style={fs.page}>{error ? <ErrorText>{error}</ErrorText> : <Loading />}</View>;
  }

  const { ev, userId, people } = data;
  const { event: e, family, person, me, daysAway, members, tasks, card } = ev;
  const date = fromISO(e.eventDate);
  const total = members.length;
  const counts = { going: 0, maybe: 0, no: 0 };
  for (const m of members) if (m.rsvp) counts[m.rsvp]++;
  const signed = card?.signedBy.length ?? 0;
  const canManage = me.role === 'owner' || me.role === 'admin';

  return (
    <ScrollView style={fs.page} contentContainerStyle={fs.pad}>
      <View style={fs.headRow}>
        <MiniButton label="‹" a11y={t('Back to {name}', { name: family.name })} onPress={() => router.push(`/family/${e.familyId}`)} />
        <View style={{ flex: 1 }}>
          <Text style={fs.muted}>{family.name}</Text>
          <Title>{e.title}</Title>
        </View>
      </View>

      <View style={fs.hero} accessibilityLabel={t('Event details')}>
        <Text style={styles.eyebrow}>
          {daysAway === 0 ? t('Today') : daysAway === 1 ? t('Tomorrow') : daysAway > 1 ? t('In {daysAway} days', { daysAway }) : t('Past event')}
        </Text>
        <Text style={styles.heroDate}>{`${formatCalDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}${e.eventTime ? ` · ${e.eventTime}` : ''}`}</Text>
        {e.place ? <Text style={styles.heroText}>{e.place}</Text> : null}
        {person ? (
          <Text style={styles.heroText}>
            {t('For')}{' '}
            <Text style={styles.heroLink} onPress={() => openLink(`/people/${person.id}`)}>{person.name}</Text>
          </Text>
        ) : null}
        {e.notes ? <Text style={styles.heroText}>{e.notes}</Text> : null}
      </View>

      <Section title={t('Are you coming?')}>
        <View style={styles.seg}>
          {RSVP_OPTIONS.map((s) => {
            const on = me.rsvp === s;
            return (
              <Pressable key={s} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => pick(s)} style={[styles.segBtn, on && styles.segOn]}>
                <Text style={[styles.segText, on && styles.segTextOn]}>{t(RSVP_LABEL[s])}</Text>
              </Pressable>
            );
          })}
        </View>
        <ErrorText>{rsvpError}</ErrorText>
        <Text style={fs.muted}>
          {t('{going} going · {maybe} maybe · {no} can’t go · {waiting} not replied', { going: counts.going, maybe: counts.maybe, no: counts.no, waiting: total - counts.going - counts.maybe - counts.no })}
        </Text>
        {members.map((m) => (
          <View key={m.userId} style={fs.item}>
            <Avatar small name={m.name} id={m.userId} />
            <Text style={[fs.body, { flex: 1 }]}>{m.userId === userId ? t('{name} (you)', { name: m.name }) : m.name}</Text>
            {m.rsvp ? <Badge label={t(RSVP_LABEL[m.rsvp])} tone={m.rsvp === 'going' ? 'green' : 'neutral'} /> : <Badge label={t('No reply')} />}
          </View>
        ))}
      </Section>

      <Section title={t('Group card')}>
        {card ? (
          <>
            <Text style={fs.muted}>{`${t('Everyone signs one card')}${person ? t(' for {v}', { v: person.name.split(' ')[0] }) : ''}${t('. Send it on the day.')}`}</Text>
            <View style={fs.rowBetween}>
              <Text style={fs.strong}>{t('{signed} of {total} family signed', { signed, total })}</Text>
              <Text style={fs.muted}>{card.signatureCount === 1 ? t('{n} message', { n: 1 }) : t('{n} messages', { n: card.signatureCount })}</Text>
            </View>
            <View style={styles.track} accessibilityRole="progressbar" accessibilityLabel={t('Family signatures')} accessibilityValue={{ min: 0, max: total, now: signed }}>
              <View style={[styles.fill, { width: `${Math.round((signed / Math.max(1, total)) * 100)}%` }]} />
            </View>
            <View style={fs.chips}>
              {members.map((m) => {
                const done = card.signedBy.includes(m.userId);
                return <Badge key={m.userId} label={`${done ? '✓ ' : ''}${m.name.split(' ')[0]}`} tone={done ? 'green' : 'neutral'} />;
              })}
            </View>
            <View style={fs.row2}>
              <MiniButton variant="primary" label={card.signedBy.includes(userId) ? t('Open the card') : t('Sign the card')} onPress={() => openLink(`/w/${card.slug}`)} />
              {card.ownedByMe ? <MiniButton label={t('Send or schedule')} onPress={() => openLink(`/wishes/${card.wishId}`)} /> : null}
            </View>
          </>
        ) : me.canEdit ? (
          <>
            <Text style={fs.muted}>{t('Start one card that the whole family signs. We’ll write the first message and let everyone know.')}</Text>
            <Button label={t('Start the group card')} busy={cardBusy} onPress={startCard} />
            <ErrorText>{cardError}</ErrorText>
          </>
        ) : (
          <Text style={fs.muted}>{t('No group card yet.')}</Text>
        )}
      </Section>

      <Section title={t('Who’s doing what')}>
        <TaskBoard
          familyId={e.familyId}
          eventId={e.id}
          tasks={tasks}
          members={members}
          me={{ userId, canEdit: me.canEdit, canManage }}
          onChanged={load}
        />
      </Section>

      {me.canChange ? (
        <View style={{ gap: 16 }}>
          <Disclosure title={t('Edit event')}>
            <EventForm
              familyId={e.familyId}
              eventId={e.id}
              people={people}
              today={toISO(todayLocal())}
              initial={{
                title: e.title,
                occasion: e.occasion,
                eventDate: e.eventDate,
                eventTime: e.eventTime ?? '',
                place: e.place ?? '',
                notes: e.notes ?? '',
                personId: e.personId ?? '',
              }}
              onSaved={() => load()}
            />
          </Disclosure>
          <DeleteEvent eventId={e.id} familyId={e.familyId} title={e.title} />
        </View>
      ) : null}
    </ScrollView>
  );
}

function DeleteEvent({ eventId, familyId, title }: { eventId: string; familyId: string; title: string }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!confirming) {
    return <Button label={t('Delete event')} variant="danger" onPress={() => setConfirming(true)} />;
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await deleteEvent(eventId);
      router.replace(`/family/${familyId}`);
    } catch (e) {
      setError(errorMessage(e, t('Something went wrong')));
      setBusy(false);
    }
  }

  return (
    <View style={fs.confirmBox} accessibilityRole="alert">
      <Text style={fs.body}>{t('Delete “{title}” with its RSVPs and tasks? Everyone in the circle loses it.', { title })}</Text>
      <View style={fs.row2}>
        <MiniButton variant="danger" label={t('Yes, delete')} busy={busy} onPress={remove} />
        <MiniButton label={t('Cancel')} onPress={() => setConfirming(false)} />
      </View>
      <ErrorText>{error}</ErrorText>
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontSize: 12, fontWeight: '700', color: '#9FD9BF', textTransform: 'uppercase' },
  heroDate: { fontSize: 20, fontWeight: '700', color: '#fff' },
  heroText: { fontSize: 14, color: '#E4E1EC' },
  heroLink: { color: '#fff', textDecorationLine: 'underline', fontWeight: '600' },
  seg: { flexDirection: 'row', borderWidth: 1, borderColor: colors.line, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surface },
  segBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  segOn: { backgroundColor: colors.brand },
  segText: { fontSize: 15, fontWeight: '600', color: colors.text },
  segTextOn: { color: '#fff' },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.line, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: '#1f7a4d' },
});
