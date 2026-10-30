import { addDays, compare, daysBetween, nextYearly, todayIn, zonedTime, type CalDate } from './dates';

export type Stage = 'gift' | 'ideas' | 'draft' | 'day';

/** Days before the occasion each reminder fires, and its local delivery time. */
export const STAGES: { stage: Stage; daysBefore: number; hour: number; title: string }[] = [
  { stage: 'gift', daysBefore: 7, hour: 9, title: 'Gift reminder' },
  { stage: 'ideas', daysBefore: 3, hour: 9, title: 'Gift ideas' },
  { stage: 'draft', daysBefore: 1, hour: 18, title: 'Wish drafted' },
  { stage: 'day', daysBefore: 0, hour: 9, title: 'Send today' }
];

export type OccasionForReminders = {
  id: string;
  month: number;
  day: number;
  remindGift: boolean;
  remindIdeas: boolean;
  remindDraft: boolean;
  remindDay: boolean;
};

export type PlannedReminder = { occasionId: string; stage: Stage; eventDate: CalDate; dueAt: Date };

function stageEnabled(o: OccasionForReminders, s: Stage) {
  return s === 'gift' ? o.remindGift : s === 'ideas' ? o.remindIdeas : s === 'draft' ? o.remindDraft : o.remindDay;
}

/**
 * Reminders to create for the next occurrence of an occasion.
 * Stages whose time has already passed are skipped, except the "day" stage,
 * which is still due if today is the occasion day. Only occurrences within
 * `horizonDays` are planned, so the job can run daily and stay idempotent.
 */
export function planReminders(o: OccasionForReminders, timezone: string, now: Date, horizonDays = 14): PlannedReminder[] {
  const today = todayIn(timezone, now);
  const event = nextYearly(o.month, o.day, today);
  if (daysBetween(today, event) > horizonDays) return [];
  const out: PlannedReminder[] = [];
  for (const s of STAGES) {
    if (!stageEnabled(o, s.stage)) continue;
    const date = addDays(event, -s.daysBefore);
    const dueAt = zonedTime(date, s.hour, 0, timezone);
    const passed = dueAt.getTime() < now.getTime();
    if (passed && !(s.stage === 'day' && compare(today, event) === 0)) continue;
    out.push({ occasionId: o.id, stage: s.stage, eventDate: event, dueAt: passed ? now : dueAt });
  }
  return out;
}

export function reminderCopy(stage: Stage, personName: string, occasionLabel: string, daysAway: number) {
  switch (stage) {
    case 'gift':
      return { title: `${personName}'s ${occasionLabel} in ${daysAway} days`, body: 'Time to plan a gift.' };
    case 'ideas':
      return { title: `Gift ideas for ${personName}`, body: `${occasionLabel} is in ${daysAway} days. Here are a few ideas.` };
    case 'draft':
      return { title: `Your wish for ${personName} is ready`, body: `${occasionLabel} is tomorrow. Review the wish we drafted.` };
    case 'day':
      return { title: `It's ${personName}'s ${occasionLabel} today`, body: 'Your wish is ready — one tap to send.' };
  }
}
