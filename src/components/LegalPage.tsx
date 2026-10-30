import { cfg } from '@/server/settings';
import Link from 'next/link';
import type { ReactNode } from 'react';

/** Company details come from settings so the documents never show placeholders. */
export const LEGAL = {
  company: cfg('LEGAL_COMPANY_NAME') || 'Blessly',
  address: cfg('LEGAL_ADDRESS') || '',
  email: cfg('SUPPORT_EMAIL') || 'support@blessly.app',
  grievance: cfg('GRIEVANCE_OFFICER') || '',
  approved: cfg('LEGAL_APPROVED') === '1',
  updated: '26 October 2026'
};

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="legal" style={{ maxWidth: 760, margin: '0 auto', padding: '32px 16px 64px' }}>
      <Link href="/" className="brand">Blessly</Link>
      <h1 style={{ marginTop: 16 }}>{title}</h1>
      <p className="muted small">Last updated {LEGAL.updated}</p>
      {!LEGAL.approved && <p className="notice small" role="note">Draft — this document is waiting for legal review and may change before Blessly launches.</p>}
      {children}
      <p className="muted small" style={{ marginTop: 32 }}><Link href="/privacy">Privacy policy</Link> · <Link href="/terms">Terms of use</Link> · <Link href="/pricing">Pricing</Link></p>
    </main>
  );
}
