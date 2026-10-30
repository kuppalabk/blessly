import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { Alert, Linking, Pressable, ScrollView, Share, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { deviceLanguage, t } from '../../src/i18n';
import { Button, ErrorText, Field, Loading, Section, Title, colors, styles as uiStyles } from '../../src/ui';
import { me as loadMe } from '../../src/api/endpoints';
import { API_URL } from '../../src/config';
import { daysBetween, formatCalDate, fromISO, todayLocal, toISO, type CalDate } from '../../src/api/calendar';
import {
  EVENT_OCCASION_GROUPS, ROLE_LABEL, createEvent, createInvite, createTask, deleteTask, errorMessage, getFamily, openLink,
  removeMember, revokeInvite, updateEvent, updateMember, updateTask,
  type EventInput, type FamilyView, type Invite, type Member, type Role, type Task, type TaskStatus,
} from '../../src/api/family';

/* ---------------- Shared pieces (also used by the family event screen) ---------------- */

const RANK: Record<Role, number> = { owner: 3, admin: 2, member: 1, viewer: 0 };
const HUES = ['#5b3fd6', '#1f7a4d', '#b35c00', '#a4306a', '#1d6fa3', '#7a6200'];

function initials(name: string) {
  return name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
}

function hueOf(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % HUES.length;
}

export function Avatar({ name, id, small }: { name: string; id: string; small?: boolean }) {
  const size = small ? 28 : 40;
  return (
    <View style={[familyStyles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: HUES[hueOf(id)] }]}>
      <Text style={[familyStyles.avatarText, { fontSize: small ? 11 : 14 }]}>{initials(name)}</Text>
    </View>
  );
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'green' | 'hot' | 'purple' | 'neutral' }) {
  const [bg, fg] = BADGE_TONES[tone];
  return <Text style={[familyStyles.badge, { backgroundColor: bg, color: fg }]}>{label}</Text>;
}
const BADGE_TONES = { green: ['#e6f4ec', '#1f7a4d'], hot: ['#fff1e0', '#b35c00'], purple: ['#ece8ff', colors.brand], neutral: [colors.page, colors.muted] } as const;

export function MiniButton({ label, onPress, busy, variant = 'ghost', disabled, a11y }: { label: string; onPress: () => void; busy?: boolean; variant?: 'ghost' | 'primary' | 'danger' | 'light' | 'green'; disabled?: boolean; a11y?: string }) {
  const bg = { ghost: colors.surface, primary: colors.brand, danger: colors.danger, light: '#ffffff', green: '#1f7a4d' }[variant];
  const border = variant === 'ghost' ? colors.line : bg;
  const fg = variant === 'ghost' ? colors.brand : variant === 'light' ? colors.text : '#fff';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y ?? label}
      disabled={busy || disabled}
      onPress={onPress}
      style={({ pressed }) => [familyStyles.mini, { backgroundColor: bg, borderColor: border, opacity: busy || disabled ? 0.5 : pressed ? 0.8 : 1 }]}
    >
      <Text style={[familyStyles.miniText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

function Pill({ label, selected, onPress, disabled }: { label: string; selected: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected, disabled: !!disabled }} disabled={disabled} onPress={onPress} style={[familyStyles.pill, selected && familyStyles.pillOn]}>
      <Text style={[familyStyles.pillText, selected && familyStyles.pillTextOn]}>{label}</Text>
    </Pressable>
  );
}

export function Chips<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={familyStyles.chips}>
      {options.map((o) => <Pill key={o.value} label={o.label} selected={o.value === value} onPress={() => onChange(o.value)} />)}
    </View>
  );
}

export function Disclosure({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={familyStyles.card}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((o) => !o)} style={familyStyles.rowBetween}>
        <Text style={familyStyles.strong}>{title}</Text>
        <Text style={familyStyles.muted}>{open ? '▴' : '▾'}</Text>
      </Pressable>
      {open ? <View style={{ marginTop: 14 }}>{children}</View> : null}
    </View>
  );
}

const shortDate = (iso: string) => new Intl.DateTimeFormat(deviceLanguage(), { day: 'numeric', month: 'short' }).format(new Date(iso));
const dayLabel = (days: number) => (days === 0 ? t('Today') : days === 1 ? t('Tomorrow') : t('In {n} days', { n: days }));
const TASK_COLS: { status: TaskStatus; label: string }[] = [
  { status: 'todo', label: 'To do' },
  { status: 'doing', label: 'In progress' },
  { status: 'done', label: 'Done' },
];
const NEXT: Record<TaskStatus, { to: TaskStatus; label: string }> = {
  todo: { to: 'doing', label: 'Start' },
  doing: { to: 'done', label: 'Mark done' },
  done: { to: 'todo', label: 'Reopen' },
};

/** "Who is doing what". Three stacked columns on a phone. */
export function TaskBoard({ tasks, members, familyId, eventId, me, onChanged }: {
  tasks: Task[]; members: { userId: string; name: string }[]; familyId: string; eventId?: string;
  me: { userId: string; canEdit: boolean; canManage: boolean }; onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState('');
  const [dueDate, setDueDate] = useState('');

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(errorMessage(e, t('Something went wrong')));
    }
    setBusy(null);
  }

  function add() {
    if (!title.trim()) {
      setError(t('What needs doing?'));
      return;
    }
    run('add', async () => {
      await createTask(familyId, { title, assigneeId: assignee || null, dueDate: dueDate.trim() || null, eventId: eventId ?? null });
      setTitle('');
      setAssignee('');
      setDueDate('');
    });
  }

  return (
    <View style={{ gap: 14 }}>
      {TASK_COLS.map((col) => {
        const list = tasks.filter((x) => x.status === col.status);
        return (
          <View key={col.status} style={{ gap: 8 }}>
            <Text style={familyStyles.eyebrow}>{`${t(col.label)} · ${list.length}`}</Text>
            {list.map((task) => {
              const mayMove = me.canEdit || task.assigneeId === me.userId;
              const mayDelete = me.canManage || (me.canEdit && task.createdBy === me.userId);
              return (
                <View key={task.id} style={[familyStyles.task, task.status === 'done' && { opacity: 0.6 }]}>
                  <Text style={familyStyles.itemTitle}>{task.title}</Text>
                  <View style={familyStyles.rowMeta}>
                    {task.assigneeId ? (
                      <>
                        <Avatar small name={task.assigneeName ?? '?'} id={task.assigneeId} />
                        <Text style={[familyStyles.body, { flex: 1 }]}>{task.assigneeId === me.userId ? t('You') : task.assigneeName}</Text>
                      </>
                    ) : (
                      <Text style={[familyStyles.muted, { flex: 1 }]}>{t('Unassigned')}</Text>
                    )}
                    {task.dueDate ? <Badge label={shortDate(task.dueDate + 'T00:00:00')} /> : null}
                  </View>
                  {mayMove || mayDelete ? (
                    <View style={familyStyles.row2}>
                      {mayMove ? (
                        <MiniButton label={t(NEXT[task.status].label)} busy={busy === task.id} onPress={() => run(task.id, () => updateTask(task.id, { status: NEXT[task.status].to }))} />
                      ) : null}
                      {me.canEdit && !task.assigneeId ? (
                        <MiniButton label={t('I’ll do it')} busy={busy === task.id} onPress={() => run(task.id, () => updateTask(task.id, { assigneeId: me.userId }))} />
                      ) : null}
                      {mayDelete ? (
                        <MiniButton label="✕" a11y={t('Delete task {title}', { title: task.title })} busy={busy === task.id} onPress={() => run(task.id, () => deleteTask(task.id))} />
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        );
      })}
      {me.canEdit ? (
        <View style={familyStyles.card}>
          <Field label={t('New task')} value={title} onChangeText={setTitle} placeholder={t('e.g. Order the cake')} maxLength={100} />
          <Text style={familyStyles.label}>{t('Who')}</Text>
          <Chips
            value={assignee}
            onChange={setAssignee}
            options={[{ value: '', label: t('Anyone') }, ...members.map((m) => ({ value: m.userId, label: m.userId === me.userId ? t('Me ({name})', { name: m.name }) : m.name }))]}
          />
          <Field label={t('Due (optional)')} value={dueDate} onChangeText={setDueDate} placeholder="YYYY-MM-DD" autoCapitalize="none" />
          <Button label={t('Add task')} busy={busy === 'add'} onPress={add} />
        </View>
      ) : null}
      <ErrorText>{error}</ErrorText>
    </View>
  );
}

export type EventFormState = { title: string; occasion: string; eventDate: string; eventTime: string; place: string; notes: string; personId: string };

const groupFor = (occasion: string) => EVENT_OCCASION_GROUPS.find((g) => g.ids.some((o) => o.id === occasion))?.label ?? EVENT_OCCASION_GROUPS[0].label;

/** Add or edit a family event. Used on the circle screen (add) and the event screen (edit). */
export function EventForm({ familyId, people, eventId, initial, today, onSaved }: {
  familyId: string; people: { id: string; name: string }[]; eventId?: string; initial?: EventFormState; today: string; onSaved: (id: string) => void;
}) {
  const [v, setV] = useState<EventFormState>(initial ?? { title: '', occasion: 'birthday', eventDate: today, eventTime: '', place: '', notes: '', personId: '' });
  const [group, setGroup] = useState(() => groupFor(v.occasion));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof EventFormState) => (val: string) => setV((prev) => ({ ...prev, [k]: val }));
  const current = EVENT_OCCASION_GROUPS.find((g) => g.label === group) ?? EVENT_OCCASION_GROUPS[0];

  async function save() {
    setError(null);
    if (!v.title.trim()) return setError(t('Give the event a name'));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.eventDate.trim())) return setError(t('Pick a date'));
    if (v.eventTime.trim() && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v.eventTime.trim())) return setError(t('Use a time like 19:30'));
    const body: EventInput = {
      title: v.title.trim(),
      occasion: v.occasion,
      eventDate: v.eventDate.trim(),
      eventTime: v.eventTime.trim() || null,
      place: v.place.trim() || null,
      notes: v.notes.trim() || null,
      personId: v.personId || null,
    };
    setBusy(true);
    try {
      const res = eventId ? await updateEvent(eventId, body) : await createEvent(familyId, body);
      onSaved(res.event.id);
    } catch (e) {
      setError(errorMessage(e, t('Could not save')));
    }
    setBusy(false);
  }

  return (
    <View style={{ gap: 12 }}>
      <Field label={t('What’s happening')} value={v.title} onChangeText={set('title')} placeholder={t('e.g. Dadi’s 80th birthday dinner')} maxLength={80} />
      <Text style={familyStyles.label}>{t('Occasion')}</Text>
      <Chips value={group} onChange={setGroup} options={EVENT_OCCASION_GROUPS.map((g) => ({ value: g.label, label: t(g.label) }))} />
      <Chips value={v.occasion} onChange={set('occasion')} options={current.ids.map((o) => ({ value: o.id, label: t(o.label) }))} />
      <Text style={familyStyles.label}>{t('For (optional)')}</Text>
      <Chips value={v.personId} onChange={set('personId')} options={[{ value: '', label: t('The whole family') }, ...people.map((p) => ({ value: p.id, label: p.name }))]} />
      <View style={familyStyles.twoCol}>
        <View style={{ flex: 1 }}>
          <Field label={t('Date')} value={v.eventDate} onChangeText={set('eventDate')} placeholder="YYYY-MM-DD" autoCapitalize="none" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label={t('Time (optional)')} value={v.eventTime} onChangeText={set('eventTime')} placeholder="HH:MM" autoCapitalize="none" />
        </View>
      </View>
      <Field label={t('Where (optional)')} value={v.place} onChangeText={set('place')} placeholder={t('e.g. Nani’s house')} maxLength={120} />
      <View style={uiStyles.field}>
        <Text style={uiStyles.label}>{t('Notes (optional)')}</Text>
        <TextInput
          multiline
          value={v.notes}
          onChangeText={set('notes')}
          maxLength={500}
          style={[uiStyles.input, { minHeight: 80, textAlignVertical: 'top' }]}
        />
      </View>
      <ErrorText>{error}</ErrorText>
      <Button label={eventId ? t('Save changes') : t('Add event')} busy={busy} onPress={save} />
    </View>
  );
}

/* ---------------- Circle screen ---------------- */

export default function CircleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [view, setView] = useState<FamilyView | null>(null);
  const [inviter, setInviter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const inviteY = useRef(0);

  const load = useCallback(() => {
    getFamily(id)
      .then((v) => { setView(v); setError(null); })
      .catch((e) => setError(errorMessage(e, t('Could not load the circle.'))));
  }, [id]);
  useFocusEffect(load);
  useEffect(() => {
    loadMe().then((r) => setInviter(r.user.name)).catch(() => {});
  }, []);

  if (!view) {
    return <View style={familyStyles.page}>{error ? <ErrorText>{error}</ErrorText> : <Loading />}</View>;
  }

  const { family, me, members, events, tasks, shared, invites, limit, seatsLeft } = view;
  const today = todayLocal();
  const eventTitle = new Map(events.map((e) => [e.id, e.title]));
  const openTasks = tasks.filter((x) => x.status !== 'done').length;
  const boardTasks = tasks.map((x) => ({ ...x, title: x.eventId && eventTitle.get(x.eventId) ? `${x.title} · ${eventTitle.get(x.eventId)}` : x.title }));

  return (
    <ScrollView ref={scroll} style={familyStyles.page} contentContainerStyle={familyStyles.pad} keyboardShouldPersistTaps="handled">
      <View style={familyStyles.headRow}>
        <MiniButton label="‹" a11y={t('All family circles')} onPress={() => router.push('/family?all=1')} />
        <View style={{ flex: 1 }}>
          <Title>{family.name}</Title>
          <Text style={familyStyles.muted}>{t('{length} of {limit} people · you’re {v}', { length: members.length, limit, v: ROLE_LABEL[me.role].toLowerCase() })}</Text>
        </View>
        <MiniButton label={t('Calendar')} onPress={() => router.push('/calendar')} />
      </View>

      <View style={familyStyles.hero} accessibilityLabel={t('Circle summary')}>
        <View style={familyStyles.rowBetween}>
          <View style={familyStyles.avatarRow} accessibilityLabel={t('Members: {v}', { v: members.map((m) => m.name).join(', ') })}>
            {members.map((m) => <Avatar key={m.userId} name={m.name} id={m.userId} />)}
          </View>
          {me.canManage && seatsLeft > 0 ? (
            <MiniButton variant="light" label={t('+ Invite')} onPress={() => scroll.current?.scrollTo({ y: inviteY.current, animated: true })} />
          ) : null}
        </View>
        <View style={familyStyles.statsRow}>
          <Stat value={events.length} label={t('upcoming events')} />
          <Stat value={openTasks} label={t('open tasks')} />
          <Stat value={shared.length} label={t('shared people')} />
        </View>
      </View>

      <Section title={t('Family events')}>
        {events.length === 0 ? <Text style={familyStyles.muted}>{t('No events yet. Add a birthday dinner, a puja or a get-together.')}</Text> : null}
        {events.map((e) => {
          const d = fromISO(e.eventDate);
          const days = daysBetween(today, d);
          const mine = e.myRsvp;
          return (
            <Pressable key={e.id} accessibilityRole="button" onPress={() => router.push(`/family/events/${e.id}`)} style={familyStyles.item}>
              <DateTile date={d} />
              <View style={{ flex: 1 }}>
                <Text style={familyStyles.itemTitle}>{e.title}</Text>
                <Text style={familyStyles.muted}>
                  {`${dayLabel(days)}${e.eventTime ? ` · ${e.eventTime}` : ''} · ${t('{n} going', { n: e.rsvp.going })}${e.rsvp.maybe ? t(', {maybe} maybe', { maybe: e.rsvp.maybe }) : ''}`}
                </Text>
              </View>
              {mine === 'going' ? <Badge label={t('Going')} tone="green" /> : mine === 'maybe' ? <Badge label={t('Maybe')} /> : mine === 'no' ? <Badge label={t('Can’t go')} /> : <Badge label={t('Reply')} tone="hot" />}
            </Pressable>
          );
        })}
        {me.canEdit ? (
          <Disclosure title={t('+ Add a family event')}>
            <EventForm familyId={family.id} people={shared} today={toISO(today)} onSaved={(eventId) => router.push(`/family/events/${eventId}`)} />
          </Disclosure>
        ) : null}
      </Section>

      <Section>
        <View style={familyStyles.rowBetween}>
          <Text style={familyStyles.h2}>{t('Shared dates')}</Text>
          {me.canEdit ? <MiniButton label={t('+ Share someone')} onPress={() => openLink(`/people/new?family=${family.id}`)} /> : null}
        </View>
        <Text style={familyStyles.muted}>{t('Everyone here gets reminders for these people. Your other people stay private.')}</Text>
        {shared.length === 0 ? <Text style={familyStyles.muted}>{t('Nobody shared yet — add grandparents, cousins and aunties so no one forgets.')}</Text> : null}
        {shared.map((p) => (
          <Pressable key={p.id} accessibilityRole="button" onPress={() => openLink(`/people/${p.id}`)} style={familyStyles.item}>
            <Avatar name={p.name} id={p.id} />
            <View style={{ flex: 1 }}>
              <Text style={familyStyles.itemTitle}>{p.name}</Text>
              <Text style={familyStyles.muted}>{`${t(p.relationship)} · ${p.ownerId === me.userId ? t('shared by you') : t('shared by {name}', { name: p.ownerName ?? '' })}`}</Text>
            </View>
          </Pressable>
        ))}
      </Section>

      <Section title={t('Who’s doing what')}>
        <TaskBoard familyId={family.id} members={members} tasks={boardTasks} me={{ userId: me.userId, canEdit: me.canEdit, canManage: me.canManage }} onChanged={load} />
      </Section>

      <Section title={t('People in this circle')}>
        <Members familyId={family.id} familyName={family.name} members={members} me={{ userId: me.userId, role: me.role }} onChanged={load} />
      </Section>

      {me.canManage ? (
        <View onLayout={(e) => { inviteY.current = e.nativeEvent.layout.y; }}>
          <Section title={t('Invite relatives')}>
            <Text style={familyStyles.muted}>{t('Send the link on WhatsApp or anywhere. It works for 7 days; anyone with it can join until the circle is full.')}</Text>
            <InviteBox
              familyId={family.id}
              familyName={family.name}
              inviter={inviter}
              invites={invites}
              isOwner={me.role === 'owner'}
              seatsLeft={seatsLeft}
              limit={limit}
              onChanged={load}
            />
          </Section>
        </View>
      ) : null}

      <ErrorText>{error}</ErrorText>
    </ScrollView>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View>
      <Text style={familyStyles.statValue}>{value}</Text>
      <Text style={familyStyles.statLabel}>{label}</Text>
    </View>
  );
}

export function DateTile({ date }: { date: CalDate }) {
  return (
    <View style={familyStyles.dateTile}>
      <Text style={familyStyles.dateDay}>{date.d}</Text>
      <Text style={familyStyles.dateMon}>{formatCalDate(date, { month: 'short' })}</Text>
    </View>
  );
}

function Members({ familyId, familyName, members, me, onChanged }: {
  familyId: string; familyName: string; members: Member[]; me: { userId: string; role: Role }; onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const isManager = me.role === 'owner' || me.role === 'admin';
  const mine = members.find((m) => m.userId === me.userId);

  async function run(key: string, fn: () => Promise<unknown>, after?: () => void) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      if (after) after();
      else onChanged();
    } catch (e) {
      setError(errorMessage(e, t('Something went wrong')));
    }
    setBusy(null);
    setConfirm(null);
  }

  function changeRole(m: Member, role: Role) {
    if (role === m.role) return;
    const go = () => run(m.userId, () => updateMember(familyId, m.userId, { role }));
    if (role === 'owner') {
      Alert.alert(t('Make owner'), t("Make {name} the owner? You'll become an admin.", { name: m.name }), [
        { text: t('Cancel'), style: 'cancel' },
        { text: t('Make owner'), onPress: go },
      ]);
    } else {
      go();
    }
  }

  return (
    <View style={{ gap: 12 }}>
      {members.map((m) => {
        const self = m.userId === me.userId;
        const canRemove = !self && isManager && RANK[m.role] < RANK[me.role];
        return (
          <View key={m.userId} style={familyStyles.memberBlock}>
            <View style={familyStyles.item}>
              <Avatar name={m.name} id={m.userId} />
              <View style={{ flex: 1 }}>
                <Text style={familyStyles.itemTitle}>{`${m.name}${self ? t(' (you)') : ''}`}</Text>
                {m.email ? <Text style={familyStyles.muted}>{m.email}</Text> : null}
              </View>
            </View>
            <View style={familyStyles.row2}>
              {me.role === 'owner' && !self ? (
                <Chips<Role>
                  value={m.role}
                  onChange={(role) => changeRole(m, role)}
                  options={(['admin', 'member', 'viewer', 'owner'] as Role[]).map((r) => ({ value: r, label: r === 'owner' ? t('Make owner') : t(ROLE_LABEL[r]) }))}
                />
              ) : (
                <Badge label={t(ROLE_LABEL[m.role])} tone={m.role === 'owner' ? 'purple' : 'neutral'} />
              )}
              {canRemove ? (
                confirm === m.userId ? (
                  <View style={familyStyles.row2}>
                    <Text style={familyStyles.body}>{t('Remove {v}?', { v: m.name.split(' ')[0] })}</Text>
                    <MiniButton variant="danger" label={t('Remove')} busy={busy === m.userId} onPress={() => run(m.userId, () => removeMember(familyId, m.userId))} />
                    <MiniButton label={t('Cancel')} onPress={() => setConfirm(null)} />
                  </View>
                ) : (
                  <MiniButton label={t('Remove')} a11y={t('Remove {name}', { name: m.name })} onPress={() => setConfirm(m.userId)} />
                )
              ) : null}
            </View>
          </View>
        );
      })}

      {mine ? (
        <View style={familyStyles.card}>
          <View style={familyStyles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={familyStyles.itemTitle}>{t('Remind me about shared dates')}</Text>
              <Text style={familyStyles.muted}>{t('Birthdays and anniversaries shared in {familyName}', { familyName })}</Text>
            </View>
            <Switch
              accessibilityLabel={t('Remind me about shared dates')}
              value={mine.notify}
              disabled={busy === 'notify'}
              onValueChange={(v) => run('notify', () => updateMember(familyId, me.userId, { notify: v }))}
            />
          </View>
        </View>
      ) : null}

      {confirm === 'leave' ? (
        <View style={familyStyles.confirmBox} accessibilityRole="alert">
          <Text style={familyStyles.body}>
            {me.role === 'owner' && members.length === 1
              ? t("You're the only one here, so leaving deletes {familyName}.", { familyName })
              : t('Leave {familyName}? People you shared go back to private.', { familyName })}
          </Text>
          <View style={familyStyles.row2}>
            <MiniButton
              variant="danger"
              label={t('Leave')}
              busy={busy === 'leave'}
              onPress={() => run('leave', () => removeMember(familyId, me.userId), () => router.replace('/family?all=1'))}
            />
            <MiniButton label={t('Cancel')} onPress={() => setConfirm(null)} />
          </View>
        </View>
      ) : (
        <MiniButton
          label={t('Leave circle')}
          disabled={me.role === 'owner' && members.length > 1}
          onPress={() => setConfirm('leave')}
        />
      )}
      {me.role === 'owner' && members.length > 1 ? <Text style={familyStyles.muted}>{t('To leave, first make someone else the owner.')}</Text> : null}
      <ErrorText>{error}</ErrorText>
    </View>
  );
}

type InviteRole = 'admin' | 'member' | 'viewer';

function InviteBox({ familyId, familyName, inviter, invites, isOwner, seatsLeft, limit, onChanged }: {
  familyId: string; familyName: string; inviter: string; invites: Invite[]; isOwner: boolean; seatsLeft: number; limit: number; onChanged: () => void;
}) {
  const [role, setRole] = useState<InviteRole>('member');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const linkFor = (token: string) => `${API_URL}/join/${token}`;
  const message = (token: string) =>
    t('{inviter} invited you to {family} on Blessly — we’ll share birthdays, plan family events and sign cards together. Join here: {link}', { inviter, family: familyName, link: linkFor(token) });

  const roleOptions: { value: InviteRole; label: string }[] = [
    { value: 'member', label: t('Member — can add events and tasks') },
    { value: 'viewer', label: t('Can view — sees and RSVPs') },
    ...(isOwner ? [{ value: 'admin' as const, label: t('Admin — can also invite and remove') }] : []),
  ];

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(errorMessage(e, t('Something went wrong')));
    }
    setBusy(null);
  }

  async function share(inv: Invite) {
    try {
      await Share.share({ title: t('Join {family}', { family: familyName }), message: message(inv.token) });
    } catch {
      /* cancelled */
    }
  }

  return (
    <View style={{ gap: 12 }}>
      {seatsLeft > 0 ? (
        <View style={{ gap: 10 }}>
          <Text style={familyStyles.label}>{t('Invite as')}</Text>
          <Chips value={role} onChange={setRole} options={roleOptions} />
          <Button label={t('Create invite link')} busy={busy === 'create'} onPress={() => run('create', () => createInvite(familyId, role))} />
        </View>
      ) : (
        <View style={familyStyles.row2}>
          <Text style={familyStyles.body}>{t('Your circle is full ({n} people).', { n: limit })}</Text>
          {limit < 6 && isOwner ? (
            <>
              <Pressable accessibilityRole="link" onPress={() => openLink('/plans')}>
                <Text style={familyStyles.link}>{t('Upgrade to Family')}</Text>
              </Pressable>
              <Text style={familyStyles.body}>{t('for up to 6.')}</Text>
            </>
          ) : null}
        </View>
      )}

      {invites.map((inv) => (
        <View key={inv.id} style={familyStyles.card}>
          <View style={familyStyles.rowBetween}>
            <Text style={familyStyles.strong}>{t('{role} invite', { role: t(ROLE_LABEL[inv.role]) })}</Text>
            <Text style={familyStyles.muted}>{`${t('Expires')} ${shortDate(inv.expiresAt)}`}</Text>
          </View>
          <View style={familyStyles.linkBox}>
            <Text selectable style={familyStyles.code}>{linkFor(inv.token)}</Text>
          </View>
          <View style={familyStyles.row2}>
            <MiniButton variant="green" label={t('WhatsApp')} onPress={() => Linking.openURL(`https://wa.me/?text=${encodeURIComponent(message(inv.token))}`).catch(() => {})} />
            <MiniButton label={t('Share')} onPress={() => share(inv)} />
            <MiniButton label={t('Cancel')} busy={busy === inv.id} onPress={() => run(inv.id, () => revokeInvite(familyId, inv.id))} />
          </View>
        </View>
      ))}
      <ErrorText>{error}</ErrorText>
    </View>
  );
}

/** Also used by the family event screen. */
export const familyStyles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.page },
  pad: { padding: 16, gap: 16 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  hero: { backgroundColor: '#1e1b2e', borderRadius: 14, padding: 16, gap: 14 },
  statsRow: { flexDirection: 'row', gap: 24 },
  statValue: { fontSize: 22, fontWeight: '700', color: '#fff' },
  statLabel: { fontSize: 13, color: '#cfcbda' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  row2: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatarRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, flex: 1 },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  itemTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  memberBlock: { gap: 8, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  dateTile: { width: 52, height: 52, borderRadius: 12, backgroundColor: '#e6f4ec', alignItems: 'center', justifyContent: 'center' },
  dateDay: { fontSize: 16, fontWeight: '700', color: '#1f7a4d' },
  dateMon: { fontSize: 10, textTransform: 'uppercase', color: '#1f7a4d' },
  badge: { fontSize: 12, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
  mini: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, minHeight: 36, justifyContent: 'center' },
  miniText: { fontSize: 14, fontWeight: '600' },
  pill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  pillOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  pillText: { fontSize: 14, color: colors.text },
  pillTextOn: { color: '#fff', fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: { backgroundColor: colors.surface, borderRadius: 14, padding: 14, gap: 10, borderWidth: 1, borderColor: colors.line },
  task: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12, gap: 8, backgroundColor: colors.surface },
  eyebrow: { fontSize: 12, fontWeight: '700', color: colors.muted, textTransform: 'uppercase' },
  h2: { fontSize: 15, fontWeight: '600', color: colors.muted },
  label: { fontSize: 14, color: colors.muted },
  body: { fontSize: 15, color: colors.text },
  strong: { fontSize: 16, fontWeight: '600', color: colors.text },
  muted: { fontSize: 14, color: colors.muted },
  link: { fontSize: 14, color: colors.brand, fontWeight: '600', textDecorationLine: 'underline' },
  linkBox: { backgroundColor: colors.page, borderRadius: 10, padding: 10 },
  code: { fontSize: 13, color: colors.text },
  confirmBox: { backgroundColor: colors.surface, borderRadius: 12, padding: 12, gap: 10, borderWidth: 1, borderColor: colors.line },
  twoCol: { flexDirection: 'row', gap: 12 },
});
