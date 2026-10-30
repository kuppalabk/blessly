import Link from 'next/link';
import { getDb } from '@/server/db';
import { pageUser } from '@/server/http';
import { AppError } from '@/server/errors';
import { previewInvite, ROLE_LABEL } from '@/server/services/family';
import { Icon } from '@/components/Icon';
import { JoinButton } from './JoinButton';
import { getT } from '@/server/i18n';

export async function generateMetadata() {
  const { t, tp } = await getT();
  return { title: t("Join family circle"), robots: { index: false } };
}

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { t, tp } = await getT();
  const user = await pageUser();
  const { token } = await params;
  const inv = await previewInvite(getDb(), token, user.id).catch((e) => { if (e instanceof AppError && e.status === 404) return null; throw e; });
  return (
    <div className="stack-lg" style={{ maxWidth: 520, margin: '0 auto' }}>
      {!inv ? (
        <section className="card-box stack">
          <h1>{t("This invite link doesn’t work")}</h1>
          <p className="muted">{t("Check you copied the whole link, or ask for a new one.")}</p>
          <Link href="/home" className="btn">{t("Go to Blessly")}</Link>
        </section>
      ) : (
        <section className="card-box stack-lg" style={{ textAlign: 'center', alignItems: 'center' }}>
          <span className="avatar" style={{ width: 64, height: 64, borderRadius: 32, background: 'var(--green-soft)', color: 'var(--green)' }}><Icon name="family" size={30} /></span>
          <div className="stack" style={{ gap: 6 }}>
            <p className="muted">{t("{inviter} invited you to", { inviter: inv.inviter })}</p>
            <h1>{inv.familyName}</h1>
            <p className="muted small">{tp(inv.memberCount, "{n} person", "{n} people")} · {t("you’ll join as: {role}", { role: t(ROLE_LABEL[inv.role]) })}</p>
          </div>
          <ul className="stack small" style={{ textAlign: 'left', margin: 0, paddingLeft: 18, gap: 6 }}>
            <li>{t("Get reminders for the birthdays and anniversaries the family shares")}</li>
            <li>{t("RSVP to family events and pick up tasks")}</li>
            <li>{t("Sign group cards together")}</li>
            <li>{t("Your own people and reminders stay private")}</li>
          </ul>
          {inv.status === 'ok' && <JoinButton token={token} />}
          {inv.status === 'member' && <Link className="btn btn-block" href={`/family/${inv.familyId}`}>{t("You’re already in — open the circle")}</Link>}
          {inv.status === 'expired' && <p className="notice">{t("This invite has expired. Ask {inviter} for a new link.", { inviter: inv.inviter })}</p>}
          {inv.status === 'revoked' && <p className="notice">{t("This invite was cancelled. Ask {inviter} for a new link.", { inviter: inv.inviter })}</p>}
          {inv.status === 'full' && <p className="notice">{t("This circle is full (6 people).")}</p>}
        </section>
      )}
    </div>
  );
}
