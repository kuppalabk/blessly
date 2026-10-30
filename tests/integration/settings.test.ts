import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, makeUser, resetDb } from './helpers';
import { closeDb } from '@/server/db';
import { adminAudit, appSettings } from '@/server/schema';
import { cfg, listSettings, loadSettings, saveSetting, settingSource } from '@/server/settings';

beforeEach(async () => { await resetDb(); await loadSettings(true); });
afterAll(closeDb);

const SECRET = 'sk_live_TOPSECRET_7890';

async function actor() {
  const a = await makeUser({ name: 'Ada Admin' });
  return { id: a.id, email: a.email };
}

describe('integration keys (admin-managed)', () => {
  it('stores the value encrypted and shows only the last four characters', async () => {
    const who = await actor();
    await saveSetting('STRIPE_SECRET_KEY', SECRET, who);

    const [row] = await db().select().from(appSettings).where(eq(appSettings.key, 'STRIPE_SECRET_KEY'));
    expect(row.value).not.toContain(SECRET);
    expect(row.value.startsWith('v1.')).toBe(true);

    const status = (await listSettings()).find((s) => s.key === 'STRIPE_SECRET_KEY')!;
    expect(status).toMatchObject({ source: 'admin', preview: '••••7890', secret: true });
    expect(JSON.stringify(await listSettings())).not.toContain(SECRET);
    expect(cfg('STRIPE_SECRET_KEY')).toBe(SECRET);
  });

  it('records who changed a key in the audit log, never the value', async () => {
    const who = await actor();
    await saveSetting('STRIPE_SECRET_KEY', SECRET, who);
    await saveSetting('STRIPE_SECRET_KEY', '', who);

    const rows = await db().select().from(adminAudit).where(eq(adminAudit.targetId, 'STRIPE_SECRET_KEY'));
    expect(rows.map((r) => r.action).sort()).toEqual(['setting.clear', 'setting.save']);
    for (const r of rows) {
      expect(r.adminEmail).toBe(who.email);
      expect(JSON.stringify(r)).not.toContain(SECRET);
      expect(JSON.parse(r.details ?? '{}')).toEqual({ group: 'stripe' });
    }
  });

  it('clearing a key falls back to the environment value', async () => {
    const prev = process.env.EMAIL_FROM;
    process.env.EMAIL_FROM = 'Env <env@example.com>';
    try {
      const who = await actor();
      await saveSetting('EMAIL_FROM', 'Admin <admin@example.com>', who);
      expect(cfg('EMAIL_FROM')).toBe('Admin <admin@example.com>');
      expect(settingSource('EMAIL_FROM')).toBe('admin');

      await saveSetting('EMAIL_FROM', '   ', who);
      expect(cfg('EMAIL_FROM')).toBe('Env <env@example.com>');
      expect(settingSource('EMAIL_FROM')).toBe('env');
    } finally {
      if (prev === undefined) delete process.env.EMAIL_FROM; else process.env.EMAIL_FROM = prev;
    }
  });

  it('replaces an existing value on save (one row per key)', async () => {
    const who = await actor();
    await saveSetting('RESEND_API_KEY', 're_first_1111', who);
    await saveSetting('RESEND_API_KEY', 're_second_2222', who);
    const rows = await db().select().from(appSettings).where(eq(appSettings.key, 'RESEND_API_KEY'));
    expect(rows).toHaveLength(1);
    expect(cfg('RESEND_API_KEY')).toBe('re_second_2222');
  });

  it('refuses keys that are not in the registry', async () => {
    await expect(saveSetting('DATABASE_URL', 'postgres://x', await actor())).rejects.toThrow(/Unknown setting/);
  });

  it('makes a saved value visible to a fresh load (other servers pick it up)', async () => {
    await saveSetting('LEGAL_COMPANY_NAME', 'Blessly Pvt Ltd', await actor());
    await loadSettings(true);
    expect(cfg('LEGAL_COMPANY_NAME')).toBe('Blessly Pvt Ltd');
  });
});
