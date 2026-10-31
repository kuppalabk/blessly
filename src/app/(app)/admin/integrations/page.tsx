import { listSettings } from '@/server/settings';
import { IntegrationsForm } from '@/components/admin/IntegrationsForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Integrations', robots: { index: false } };

export default async function AdminIntegrations() {
  const settings = await listSettings();
  return (
    <>
      <p className="small muted">Keys saved here are encrypted in the database and override any environment variable of the same name. Secret values are never shown again after saving. Clear a key to fall back to its environment variable.</p>
      <IntegrationsForm settings={settings} />
    </>
  );
}
