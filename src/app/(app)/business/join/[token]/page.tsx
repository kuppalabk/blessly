import { getDb } from '@/server/db';
import { pageUser } from '@/server/http';
import { AppError } from '@/server/errors';
import { previewStaffInvite } from '@/server/services/business';
import { JoinTeam } from './JoinTeam';
import { getT } from '@/server/i18n';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("Join business team"), robots: { index: false } };
}

export default async function JoinBusiness({ params }: { params: Promise<{ token: string }> }) {
  const { t } = await getT();
  const user = await pageUser();
  const { token } = await params;
  const p = await previewStaffInvite(getDb(), token, user).catch((e) => { if (e instanceof AppError && e.status === 404) return null; throw e; });
  return (
    <section className="card-box stack" style={{ maxWidth: 520 }}>
      {!p ? <><h2>{t("This invite link doesn’t work")}</h2><p className="muted">{t("Ask the business owner for a new one.")}</p></> : (
        <>
          <h2>{t("Join {businessName}", { businessName: p.businessName })}</h2>
          {p.status === 'ok' && <><p className="muted">{t("You’ll be able to manage customers, birthday automations and campaigns.")}</p><JoinTeam token={token} /></>}
          {p.status === 'wrong_email' && <p className="notice">{t("This invite is for {email}, but you’re logged in as {email2}. Log out and log in (or sign up) with {email3}.", { email: p.email, email2: user.email, email3: p.email })}</p>}
          {p.status === 'expired' && <p className="notice">{t("This invite has expired. Ask the owner for a new one.")}</p>}
          {p.status === 'used' && <p className="notice">{t("This invite was already used.")}</p>}
          {p.status === 'owner' && <p className="notice">{t("You own this business already.")}</p>}
        </>
      )}
    </section>
  );
}
