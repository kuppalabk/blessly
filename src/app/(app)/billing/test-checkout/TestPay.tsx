'use client';
import { useRouter } from 'next/navigation';
import { api } from '@/components/api';
import { useT } from '@/components/I18n';

export function TestPay({ id }: { id: string }) {
  const { t } = useT();
  const router = useRouter();
  const go = async (success: boolean) => { await api('/api/billing/test-complete', { body: { subscriptionId: id, success } }); router.replace(success ? '/plans?paid=1' : '/plans?cancelled=1'); router.refresh(); };
  return (
    <div className="row" style={{ gap: 8 }}>
      <button className="btn grow" onClick={() => go(true)}>{t("Pay (test)")}</button>
      <button className="btn btn-ghost grow" onClick={() => go(false)}>{t("Fail payment")}</button>
    </div>
  );
}
