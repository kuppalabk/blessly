import Link from 'next/link';
import { getDb } from '@/server/db';
import { pageUser } from '@/server/http';
import { upcoming } from '@/server/services/home';
import { daysInMonth, formatDate, todayIn, toISO } from '@/lib/dates';
import { Icon } from '@/components/Icon';
import { getT } from '@/server/i18n';
import { weekdayNames } from '@/lib/i18n/ui';

export async function generateMetadata() {
  const { t, locale, intl } = await getT();
  return { title: t("Calendar") };
}

const COLOR = { person: 'var(--primary)', festival: 'var(--accent)', event: 'var(--green)' } as const;

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { t, locale, intl } = await getT();
  const user = await pageUser();
  const today = todayIn(user.timezone);
  const sp = await searchParams;
  const match = /^(\d{4})-(\d{2})$/.exec(sp.m ?? '');
  const y = match ? Number(match[1]) : today.y;
  const m = match && Number(match[2]) >= 1 && Number(match[2]) <= 12 ? Number(match[2]) : today.m;
  const items = (await upcoming(getDb(), user, 400)).filter((i) => i.date.y === y && i.date.m === m);
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0 = Sunday
  const lead = (first + 6) % 7; // Monday-first grid
  const dim = daysInMonth(y, m);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  const title = new Intl.DateTimeFormat(intl, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
  return (
    <div className="stack-lg" style={{ maxWidth: 720 }}>
      <header className="row between">
        <Link href={`/calendar?m=${prev}`} className="btn btn-ghost btn-sm" aria-label={t("Previous month")}><Icon name="back" size={18} /></Link>
        <h1>{title}</h1>
        <Link href={`/calendar?m=${next}`} className="btn btn-ghost btn-sm" aria-label={t("Next month")}><Icon name="next" size={18} /></Link>
      </header>
      <div className="card-box">
        <div className="cal" aria-hidden="true" style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>
          {weekdayNames(locale).map((d, i) => <span key={i}>{d}</span>)}
        </div>
        <div className="cal">
          {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
          {Array.from({ length: dim }, (_, i) => {
            const d = i + 1;
            const evs = items.filter((it) => it.date.d === d);
            const isToday = today.y === y && today.m === m && today.d === d;
            return (
              <div key={d} className={`cal-day ${isToday ? 'cal-today' : ''}`} aria-label={`${d} ${title}${evs.length ? `: ${evs.map((e) => e.title).join(', ')}` : ''}`}>
                <span style={{ fontWeight: evs.length ? 700 : 500 }}>{d}</span>
                <span className="row" style={{ gap: 2, height: 6 }}>{evs.map((e) => <span key={e.key} className="dot" style={{ background: COLOR[e.type] }} />)}</span>
              </div>
            );
          })}
        </div>
      </div>
      <p className="row small muted" style={{ gap: 16 }}><span className="row" style={{ gap: 6 }}><span className="dot" style={{ background: 'var(--primary)' }} />{t("Your people")}</span><span className="row" style={{ gap: 6 }}><span className="dot" style={{ background: 'var(--accent)' }} />{t("Festivals")}</span><span className="row" style={{ gap: 6 }}><span className="dot" style={{ background: 'var(--green)' }} />{t("Family events")}</span></p>
      <ul className="list">
        {items.length === 0 && <li className="muted">{t("Nothing this month.")}</li>}
        {items.map((i) => (
          <li key={i.key}>
            <Link className="item" href={i.href} data-date={toISO(i.date)}>
              <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: COLOR[i.type] }} />
              <span className="grow"><b>{i.title}</b><br /><span className="muted small">{i.type === 'event' ? `${i.subtitle} · ` : ''}{formatDate(i.date, undefined, intl)}{i.approximate ? t(" · date may vary") : ''}</span></span>
              <span className="badge">{i.type === 'event' ? t("Event") : t("Wish")}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
