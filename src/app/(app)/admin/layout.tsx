import { notFound, redirect } from 'next/navigation';
import { adminNeeds2fa } from '@/server/services/admin';
import { moneyEnabled } from '@/server/services/money';
import { currentUser } from '@/server/http';
import { AdminTabs } from '@/components/business/ui';

export const metadata = { title: 'Platform admin', robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const u = await currentUser();
  if (!u || u.role !== 'admin') notFound();
  if (!u.mfa && adminNeeds2fa()) redirect('/settings/security?required=admin');
  return (
    <div className="stack-lg" style={{ maxWidth: 1100 }}>
      <header className="stack" style={{ gap: 12 }}>
        <div><p className="eyebrow">Blessly</p><h1>Platform admin</h1></div>
        <AdminTabs money={moneyEnabled()} />
      </header>
      {children}
    </div>
  );
}
