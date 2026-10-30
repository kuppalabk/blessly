import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getDb } from '@/server/db';
import { pageUser } from '@/server/http';
import { listFamilies, MAX_MEMBERS, ROLE_LABEL } from '@/server/services/family';
import { Icon } from '@/components/Icon';
import { CreateFamily } from './CreateFamily';
import { getT } from '@/server/i18n';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("Family") };
}

export default async function FamilyPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const { t } = await getT();
  const user = await pageUser();
  const families = await listFamilies(getDb(), user.id);
  if (families.length === 1 && !(await searchParams).all) redirect(`/family/${families[0].id}`);
  const surname = user.name.trim().split(/\s+/).slice(1).join(' ');
  return (
    <div className="stack-lg" style={{ maxWidth: 720 }}>
      <header><h1>{t("Family Circle")}</h1></header>

      {families.length > 0 && (
        <section className="stack" aria-labelledby="mine">
          <h2 id="mine">{t("Your circles")}</h2>
          <ul className="list">
            {families.map((f) => (
              <li key={f.id}>
                <Link className="item" href={`/family/${f.id}`}>
                  <span className="avatar" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}><Icon name="family" /></span>
                  <span className="grow"><b>{f.name}</b><br /><span className="muted small">{t("{memberCount} of {limit} people · {v}", { memberCount: f.memberCount, limit: f.limit, v: ROLE_LABEL[f.role] })}</span></span>
                  <Icon name="next" size={18} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {families.length === 0 && (
        <section className="hero stack">
          <p className="eyebrow" style={{ color: '#9FD9BF' }}>{t("Plan together")}</p>
          <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22 }}>{t("Never miss a family birthday again")}</p>
          <ul className="stack small" style={{ margin: 0, paddingLeft: 18, gap: 6, color: '#E4E1EC' }}>
            <li>{t("Share birthdays and anniversaries — everyone gets the reminders")}</li>
            <li>{t("Plan events together and see who’s coming")}</li>
            <li>{t("Split the jobs: who’s getting the cake, who’s booking the table")}</li>
            <li>{t("Sign one group card from the whole family")}</li>
          </ul>
          <p className="small" style={{ color: '#CFCBDA' }}>{t("Free for up to 3 people, or up to {MAX_MEMBERS} with the Family plan. Your private reminders stay private.", { MAX_MEMBERS })}</p>
        </section>
      )}

      <section className="card-box stack">
        <h2>{families.length ? t("Start another circle") : t("Start your family circle")}</h2>
        <CreateFamily suggestion={surname ? t('The {surname} family', { surname }) : t('Our family')} />
      </section>
    </div>
  );
}
