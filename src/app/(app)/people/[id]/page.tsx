import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/server/db';
import { pageUser } from '@/server/http';
import { getVisiblePerson } from '@/server/services/people';
import { families } from '@/server/schema';
import { eq } from 'drizzle-orm';
import { AppError } from '@/server/errors';
import { addDays, formatDate } from '@/lib/dates';
import { STAGES } from '@/lib/reminders';
import { LANGUAGES } from '@/lib/i18n-data';
import { Icon } from '@/components/Icon';
import { DeletePerson } from './DeletePerson';
import { getT } from '@/server/i18n';

export async function generateMetadata() {
  const { t, intl } = await getT();
  return { title: t("Person") };
}

const CARD_FOR: Record<string, string> = { birthday: 'birthday', anniversary: 'anniversary', work_anniversary: 'newjob', custom: 'birthday' };

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { t, intl } = await getT();
  const user = await pageUser();
  const { id } = await params;
  const p = await getVisiblePerson(getDb(), user.id, id, user.timezone).catch((e) => { if (e instanceof AppError && e.status === 404) notFound(); throw e; });
  const next = p.nextOccasion;
  const circle = p.familyId ? await getDb().query.families.findFirst({ where: eq(families.id, p.familyId) }) : null;
  return (
    <div className="stack-lg" style={{ maxWidth: 720 }}>
      <header className="row">
        <Link href="/people" aria-label={t("Back to people")} className="btn btn-ghost btn-sm"><Icon name="back" size={18} /></Link>
        <div className="grow"><h1>{p.name}</h1><p className="muted small">{t(p.relationship)} · {t("wishes in {language}", { language: LANGUAGES.find((l) => l.code === p.language)?.label ?? 'English' })}</p></div>
        {p.isMine && <Link href={`/people/${p.id}/edit`} className="btn btn-ghost btn-sm">{t("Edit")}</Link>}
      </header>

      {circle && (
        <p className="notice row" style={{ gap: 8 }}><Icon name="family" size={18} />
          <span>{p.isMine ? <>{t("Shared with")}{' '}<Link href={`/family/${circle.id}`}>{circle.name}</Link> {' '}{t("— everyone there gets these reminders.")}</> : <>{t("Shared by")}{' '}{p.ownerName}{' '}{t("in")}{' '}<Link href={`/family/${circle.id}`}>{circle.name}</Link>{t(". Only")}{' '}{p.ownerName?.split(' ')[0]}{' '}{t("can edit.")}</>}</span>
        </p>
      )}

      {next && (
        <section className="hero stack">
          <p className="eyebrow" style={{ color: '#F4B98F' }}>{next.daysAway === 0 ? t("Today") : t("In {daysAway} days", { daysAway: next.daysAway })} · {formatDate(next.next, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, textTransform: 'capitalize' }}>{t(next.label)}</p>
          <Link className="btn btn-ghost" style={{ background: '#fff' }} href={`/create?person=${p.id}&occasion=${CARD_FOR[next.kind] ?? 'birthday'}`}><Icon name="sparkle" size={18} />{t("Write a wish for")}{' '}{p.name.split(' ')[0]}</Link>
        </section>
      )}

      <section className="stack" aria-labelledby="occ">
        <h2 id="occ">{t("Occasions and reminders")}</h2>
        {p.occasions.length === 0 && <p className="muted">{t("No dates yet.")}{p.isMine && <> <Link href={`/people/${p.id}/edit`}>{t("Add a birthday or anniversary")}</Link>.</>}</p>}
        {p.occasions.map((o) => (
          <div key={o.id} className="card-box stack" style={{ gap: 8 }}>
            <div className="row between"><b style={{ textTransform: 'capitalize' }}>{t(o.label)}</b><span className="badge">{formatDate(o.next, { day: 'numeric', month: 'long' })}</span></div>
            <ul className="list" style={{ gap: 4 }}>
              {STAGES.filter((s) => ({ gift: o.remindGift, ideas: o.remindIdeas, draft: o.remindDraft, day: o.remindDay })[s.stage]).map((s) => (
                <li key={s.stage} className="row small"><Icon name="clock" size={16} /><span className="grow">{s.title}</span><span className="muted">{formatDate(addDays(o.next, -s.daysBefore), undefined, intl)} · {String(s.hour).padStart(2, '0')}:00</span></li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {(p.phone || p.email || p.notes) && (
        <section className="card-box stack" style={{ gap: 6 }}>
          {p.phone && <p><span className="muted">{t("Mobile")}</span> · {p.phone}</p>}
          {p.email && <p><span className="muted">{t("Email")}</span> · {p.email}</p>}
          {p.notes && <p><span className="muted">{t("Notes")}</span> · {p.notes}</p>}
        </section>
      )}
      {p.isMine && <DeletePerson id={p.id} name={p.name} />}
    </div>
  );
}
