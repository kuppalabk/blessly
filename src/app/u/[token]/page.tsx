import { getDb } from '@/server/db';
import { AppError } from '@/server/errors';
import { customerByUnsubscribeToken } from '@/server/services/business';
import { UnsubscribeForm } from './UnsubscribeForm';
import { getT } from '@/server/i18n';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("Unsubscribe"), robots: { index: false } };
}

export default async function Unsubscribe({ params }: { params: Promise<{ token: string }> }) {
  const { t } = await getT();
  const { token } = await params;
  const row = await customerByUnsubscribeToken(getDb(), token).catch((e) => { if (e instanceof AppError && e.status === 404) return null; throw e; });
  return (
    <main style={{ maxWidth: 460, margin: '0 auto', padding: '48px 16px' }} className="stack-lg">
      {!row ? <><h1>{t("Link not valid")}</h1><p className="muted">{t("This unsubscribe link doesn’t work. You can also reply STOP to any WhatsApp message.")}</p></> : (
        <>
          <h1>{t("Messages from {businessName}", { businessName: row.businessName })}</h1>
          {row.c.waOptOutAt && row.c.emailOptOutAt ? <p className="notice">{t("You’re already unsubscribed.")}</p> : (
            <UnsubscribeForm token={token} business={row.businessName} hasPhone={!!row.c.phone && !row.c.waOptOutAt} hasEmail={!!row.c.email && !row.c.emailOptOutAt} />
          )}
          <p className="muted small">{t("Sent with Blessly on behalf of {businessName}.", { businessName: row.businessName })}</p>
        </>
      )}
    </main>
  );
}
