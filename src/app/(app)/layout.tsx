import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { moneyEnabled } from '@/server/services/money';
import { SupportBanner } from '@/components/SupportBanner';
import { currentUser } from '@/server/http';
import { getDb } from '@/server/db';
import { unreadCount } from '@/server/services/home';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect('/login');
  const unread = await unreadCount(getDb(), user.id);
  return <AppShell money={moneyEnabled()} unread={unread} isAdmin={user.role === 'admin' && !user.viewedBy} banner={user.viewedBy ? <SupportBanner name={user.name} admin={user.viewedBy} /> : null}>{children}</AppShell>;
}
