import { moneyEnabled } from '@/server/services/money';
import Link from 'next/link';
import { getDb } from '@/server/db';
import { pageUser } from '@/server/http';
import { upcoming } from '@/server/services/home';
import { formatDate, todayIn } from '@/lib/dates';
import { Icon } from '@/components/Icon';
import { getT } from '@/server/i18n';

export async function generateMetadata() {
  const { t, intl } = await getT();
  return { title: t("Home") };
}

function initials(s: string) {
  return s.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

function whenText(days: number, t: Awaited<ReturnType<typeof getT>>) {
  return days === 0 ? t.t('Today') : days === 1 ? t.t('Tomorrow') : t.tp(days, '{n} day', '{n} days');
}

export default async function Home() {
  const T = await getT();
  const { t, intl } = T;
  const user = await pageUser();
  const items = await upcoming(getDb(), user, 60);
  const today = todayIn(user.timezone);
  const next = items[0];
  const rest = items.slice(next ? 1 : 0, 8);
  return (
    <div className="stack-lg">
      <header>
        <p className="muted small">{formatDate(today, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <h1>{items.filter((i) => i.daysAway <= 14).length ? t("{length} wishes in the next two weeks", { length: items.filter((i) => i.daysAway <= 14).length }) : t("Hello, {v}", { v: user.name.split(' ')[0] })}</h1>
      </header>

      {next ? (
        <section className="hero stack" aria-label={t("Next occasion")}>
          <div className="row">
            <span className="avatar">{next.type === 'festival' ? <Icon name="sparkle" /> : next.type === 'event' ? <Icon name="family" /> : initials(next.title)}</span>
            <div className="grow">
              <p className="eyebrow" style={{ color: '#F4B98F' }}>{whenText(next.daysAway, T)} · {formatDate(next.date, undefined, intl)}</p>
              <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 21 }}>{next.title}</p>
              <p className="muted small">{next.subtitle}{next.approximate ? t(" · date may vary by region") : ''}</p>
            </div>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <Link className="btn btn-ghost grow" style={{ background: '#fff' }} href={`/create?occasion=${next.occasion ?? 'birthday'}${next.personId ? `&person=${next.personId}` : ''}`}><Icon name="sparkle" size={18} />{t("Write a wish")}</Link>
            {next.type !== 'festival' && <Link className="btn grow" style={{ background: 'transparent', border: '1.5px solid #6F6A85' }} href={next.href}>{t("Details")}</Link>}
          </div>
        </section>
      ) : (
        <section className="card-box stack">
          <h2>{t("Add the people who matter")}</h2>
          <p className="muted">{t("Add a birthday or anniversary and we’ll remind you a week before, draft the wish the day before, and nudge you on the day.")}</p>
          <Link href="/people/new" className="btn">{t("Add someone")}</Link>
        </section>
      )}

      {rest.length > 0 && (
        <section className="stack" aria-labelledby="coming">
          <div className="row between"><h2 id="coming">{t("Coming up")}</h2><Link href="/calendar" className="small" style={{ fontWeight: 700 }}>{t("Calendar")}</Link></div>
          <ul className="list">
            {rest.map((i) => (
              <li key={i.key}>
                <Link className="item" href={i.href}>
                  <span className="avatar" style={i.type === 'festival' ? { background: 'var(--primary-soft)', color: 'var(--primary-ink)' } : i.type === 'event' ? { background: 'var(--green-soft)', color: 'var(--green)' } : undefined}>{i.type === 'festival' ? <Icon name="sparkle" /> : i.type === 'event' ? <Icon name="family" /> : initials(i.title)}</span>
                  <span className="grow"><b>{i.title}</b><br /><span className="muted small">{i.subtitle} · {formatDate(i.date, undefined, intl)}</span></span>
                  <span className={`badge ${i.daysAway <= 1 ? 'badge-hot' : ''}`}>{whenText(i.daysAway, T)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="row" style={{ gap: 10, flexWrap: 'wrap' }} aria-label={t("More")}>
        <Link href="/albums" className="item grow" style={{ minWidth: 220 }}><Icon name="cards" /><span className="grow"><b>{t("Photo albums")}</b><br /><span className="muted small">{t("Collect and share photos from every occasion")}</span></span></Link>
        <Link href="/calendar" className="item grow" style={{ minWidth: 220 }}><Icon name="calendar" /><span className="grow"><b>{t("Calendar")}</b><br /><span className="muted small">{t("Birthdays, festivals and family events")}</span></span></Link>
        <Link href="/celebrations" className="item grow" style={{ minWidth: 220 }}><Icon name="family" /><span className="grow"><b>{t("Celebrations")}</b><br /><span className="muted small">{t("Party pages, invitations and RSVPs")}</span></span></Link>
        <Link href="/wishlists" className="item grow" style={{ minWidth: 220 }}><Icon name="sparkle" /><span className="grow"><b>{t("Wishlists")}</b><br /><span className="muted small">{t("Gift lists friends reserve from")}</span></span></Link>
        {moneyEnabled() && <Link href="/money" className="item grow" style={{ minWidth: 220 }}><Icon name="shop" /><span className="grow"><b>{t("Gifts and payments")}</b><br /><span className="muted small">{t("Group gifts, gift cards, shop, printed cards")}</span></span></Link>}
        <Link href="/designs" className="item grow" style={{ minWidth: 220 }}><Icon name="cards" /><span className="grow"><b>{t("My cards")}</b><br /><span className="muted small">{t("Design your own card")}</span></span></Link>
      </section>

      <section className="stack" aria-labelledby="quick">
        <h2 id="quick">{t("Quick create")}</h2>
        <div className="row-wrap">
          {[['birthday', t('Birthday')], ['anniversary', t('Anniversary')], ['diwali', t('Diwali')], ['eid', t('Eid')], ['christmas', t('Christmas')], ['getwell', t('Get well')]].map(([id, label]) => (
            <Link key={id} href={`/create?occasion=${id}`} className="chip" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>{label}</Link>
          ))}
        </div>
      </section>
    </div>
  );
}
