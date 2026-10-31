import { getDb } from '@/server/db';
import { pageUser } from '@/server/http';
import { getMyBusiness, publicBusiness } from '@/server/services/business';
import { BizTabs } from '@/components/business/ui';
import { getT } from '@/server/i18n';

export default async function BusinessLayout({ children }: { children: React.ReactNode }) {
  const { t } = await getT();
  const user = await pageUser();
  const raw = await getMyBusiness(getDb(), user.id);
  if (!raw) return <div className="stack-lg" style={{ maxWidth: 1000 }}>{children}</div>;
  const b = publicBusiness(raw);
  return (
    <div className="stack-lg" style={{ maxWidth: 1000 }}>
      <header className="stack" style={{ gap: 12 }}>
        <div className="row between" style={{ flexWrap: 'wrap' }}>
          <div><p className="eyebrow">{t("Business")}</p><h1>{b.name}</h1></div>
          <span className={`badge ${b.waConnected ? 'badge-green' : ''}`}>{b.waConnected ? `WhatsApp ${b.waDisplayNumber ?? t('connected')}` : t('WhatsApp not connected')}</span>
        </div>
        <BizTabs />
      </header>
      {b.pausedAt && <p className="notice" role="status" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>{t('Blessly has paused sending for your business: {reason}. Nothing is sent until this is resolved — please contact support.', { reason: b.pausedReason })}</p>}
      {children}
    </div>
  );
}
