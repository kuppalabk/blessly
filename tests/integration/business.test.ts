import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, givePlan, makeUser, resetDb } from './helpers';
import { closeDb } from '@/server/db';
import {
  cancelCampaign, connectWhatsApp, createBusiness, createCampaign, createCustomer, dashboard, getMyBusiness, importCustomers, listCustomers,
  parseMonthDay, publicBusiness, syncTemplates, unsubscribe, updateAutomation, updateCustomer, upcomingCustomerDates, usedThisMonth
} from '@/server/services/business';
import { chooseChannel, handleWebhook, sendQueued } from '@/server/services/bizjobs';
import { runJobs } from '@/server/services/jobs';
import { OutboxOnlyProvider } from '@/server/providers/email';
import { CloudApiProvider, WhatsAppError, type WaCreds, type WaTemplate, type WhatsAppProvider } from '@/server/providers/whatsapp';
import { decrypt, encrypt, validMetaSignature } from '@/server/crypto';
import { parseCsv } from '@/lib/csv';
import { bizMessages, businesses, customers, outbox } from '@/server/schema';

beforeEach(resetDb);
afterAll(closeDb);

const mailer = new OutboxOnlyProvider();
const TEMPLATES: WaTemplate[] = [
  { name: 'birthday_wish', language: 'en', category: 'MARKETING', status: 'APPROVED', body: 'Happy birthday {{1}}! Enjoy 10% off today at {{2}}.', paramCount: 2 },
  { name: 'diwali_offer', language: 'hi', category: 'MARKETING', status: 'PENDING', body: 'शुभ दीपावली {{1}}', paramCount: 1 },
  { name: 'too_many', language: 'en', category: 'MARKETING', status: 'APPROVED', body: '{{1}} {{2}} {{3}}', paramCount: 3 }
];

class FakeWA implements WhatsAppProvider {
  sent: { creds: WaCreds; to: string; template: string; language: string; params: string[] }[] = [];
  n = 0;
  constructor(public fail?: (to: string) => WhatsAppError | null) {}
  async sendTemplate(creds: WaCreds, m: { to: string; template: string; language: string; params: string[] }) {
    const err = this.fail?.(m.to);
    if (err) throw err;
    this.sent.push({ creds, ...m });
    return { id: `wamid.TEST${++this.n}` };
  }
  async phoneNumber(creds: WaCreds) {
    if (creds.token !== 'EAAG-good-token-1234567890') throw new WhatsAppError('Invalid OAuth access token', 190, false);
    return { displayNumber: '+91 98765 00000', verifiedName: 'Sweet Treats Bakery' };
  }
  async templates() { return TEMPLATES; }
}

// 2026-11-12 09:30 in India
const NOW = new Date('2026-11-12T04:00:00Z');

async function setup(opts: { connect?: boolean } = {}) {
  const owner = await makeUser({ name: 'Priya' });
  await givePlan(owner.id, 'business');
  await createBusiness(db(), owner.id, { name: 'Sweet Treats', timezone: 'Asia/Kolkata', country: 'IN' });
  const wa = new FakeWA();
  if (opts.connect !== false) await connectWhatsApp(db(), owner.id, { phoneNumberId: '1234567890', businessAccountId: '9876543210', accessToken: 'EAAG-good-token-1234567890' }, wa, NOW);
  const b = (await getMyBusiness(db(), owner.id))!;
  return { owner, b, wa };
}
const tpl = async (businessId: string, name = 'birthday_wish') => (await db().query.waTemplates.findFirst({ where: (t, { and, eq: q }) => and(q(t.businessId, businessId), q(t.name, name)) }))!;

describe('helpers', () => {
  it('encrypts secrets and checks Meta signatures', () => {
    const box = encrypt('EAAG-secret');
    expect(box).not.toContain('EAAG');
    expect(decrypt(box)).toBe('EAAG-secret');
    expect(() => decrypt(box.slice(0, -2) + 'xx')).toThrow();
    const body = '{"a":"é"}';
    const sig = 'sha256=' + createHmac('sha256', 's3cret').update(body).digest('hex');
    expect(validMetaSignature(body, sig, 's3cret')).toBe(true);
    expect(validMetaSignature(body + ' ', sig, 's3cret')).toBe(false);
    expect(validMetaSignature(body, 'sha256=abc', 's3cret')).toBe(false);
    expect(validMetaSignature(body, null, 's3cret')).toBe(false);
  });

  it('parses CSV with quotes, commas, newlines, BOM and semicolons', () => {
    expect(parseCsv('﻿name,notes\r\n"Rao, Anil","said ""hi""\nthere"\r\n')).toEqual([['name', 'notes'], ['Rao, Anil', 'said "hi"\nthere']]);
    expect(parseCsv('name;phone\nA;1')).toEqual([['name', 'phone'], ['A', '1']]);
  });

  it('reads birthdays in common formats, day first', () => {
    expect(parseMonthDay('1990-03-14')).toEqual({ m: 3, d: 14 });
    expect(parseMonthDay('14/03/1990')).toEqual({ m: 3, d: 14 });
    expect(parseMonthDay('14-03')).toEqual({ m: 3, d: 14 });
    expect(parseMonthDay('14 Mar')).toEqual({ m: 3, d: 14 });
    expect(parseMonthDay('March 14, 1990')).toEqual({ m: 3, d: 14 });
    expect(parseMonthDay('29/02')).toEqual({ m: 2, d: 29 });
    expect(parseMonthDay('31/02')).toBeNull();
    expect(parseMonthDay('soon')).toBeNull();
  });

  it('builds the Cloud API template request and maps Meta errors', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ messages: [{ id: 'wamid.ABC' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 131050, message: 'User stopped marketing messages' } }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 130429, message: 'Rate limit hit' } }), { status: 400 }));
    const p = new CloudApiProvider('https://graph.example', 'v23.0', fetchMock as unknown as typeof fetch);
    const creds = { phoneNumberId: '111', token: 'tok' };
    await expect(p.sendTemplate(creds, { to: '919876543210', template: 'birthday_wish', language: 'en', params: ['Nisha', 'Sweet Treats'] })).resolves.toEqual({ id: 'wamid.ABC' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://graph.example/v23.0/111/messages');
    expect(init.headers.authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toMatchObject({ messaging_product: 'whatsapp', to: '919876543210', type: 'template', template: { name: 'birthday_wish', language: { code: 'en' }, components: [{ type: 'body', parameters: [{ type: 'text', text: 'Nisha' }, { type: 'text', text: 'Sweet Treats' }] }] } });
    await expect(p.sendTemplate(creds, { to: '1', template: 't', language: 'en', params: [] })).rejects.toMatchObject({ code: 131050, optedOut: true, retryable: false });
    await expect(p.sendTemplate(creds, { to: '1', template: 't', language: 'en', params: [] })).rejects.toMatchObject({ code: 130429, retryable: true });
  });
});

describe('business workspace and WhatsApp connection', () => {
  it('creates one workspace per owner with default birthday and anniversary messages', async () => {
    const u = await makeUser();
    await createBusiness(db(), u.id, { name: 'Sweet Treats' });
    await expect(createBusiness(db(), u.id, { name: 'Again' })).rejects.toMatchObject({ status: 409 });
    const autos = await db().query.automations.findMany();
    expect(autos.map((a) => [a.kind, a.enabled])).toEqual(expect.arrayContaining([['birthday', false], ['anniversary', false]]));
  });

  it('checks credentials with Meta, stores the token encrypted and never exposes it', async () => {
    const { owner, b } = await setup();
    expect(b.waTokenEnc).toBeTruthy();
    expect(b.waTokenEnc).not.toContain('EAAG');
    expect(b.waVerifiedName).toBe('Sweet Treats Bakery');
    const pub = publicBusiness(b);
    expect(JSON.stringify(pub)).not.toContain(b.waTokenEnc!);
    expect(pub.waConnected).toBe(true);
    const other = await makeUser();
    await createBusiness(db(), other.id, { name: 'Copycat' });
    await expect(connectWhatsApp(db(), other.id, { phoneNumberId: '1234567890', businessAccountId: '1', accessToken: 'EAAG-good-token-1234567890' }, new FakeWA())).rejects.toThrow(/long number/);
    await expect(connectWhatsApp(db(), other.id, { phoneNumberId: '1234567890', businessAccountId: '9876543210', accessToken: 'EAAG-good-token-1234567890' }, new FakeWA())).rejects.toMatchObject({ status: 409 });
    await expect(connectWhatsApp(db(), owner.id, { phoneNumberId: '1234567890', businessAccountId: '9876543210', accessToken: 'EAAG-wrong-token-123456789' }, new FakeWA())).rejects.toThrow(/didn’t accept/);
  });

  it('syncs templates and only allows approved ones with up to 2 variables', async () => {
    const { owner, b } = await setup();
    expect((await syncTemplates(db(), owner.id, new FakeWA(), NOW)).map((t) => t.name)).toEqual(['birthday_wish', 'diwali_offer', 'too_many']);
    const base = { enabled: true, channel: 'whatsapp', emailSubject: 's', emailBody: 'b', sendHour: 9 };
    await expect(updateAutomation(db(), b, 'birthday', { ...base, templateId: (await tpl(b.id, 'diwali_offer')).id })).rejects.toThrow(/isn’t approved/);
    await expect(updateAutomation(db(), b, 'birthday', { ...base, templateId: (await tpl(b.id, 'too_many')).id })).rejects.toThrow(/more than 2 variables/);
    await expect(updateAutomation(db(), b, 'birthday', { ...base, templateId: null })).rejects.toThrow(/approved WhatsApp template/);
    await expect(updateAutomation(db(), b, 'birthday', { ...base, templateId: (await tpl(b.id)).id })).resolves.toMatchObject({ enabled: true });
  });
});

describe('customers', () => {
  it('normalises phones, requires a way to reach them, and rejects duplicates', async () => {
    const { b } = await setup();
    const c = await createCustomer(db(), b, { name: 'Nisha Kapoor', phone: '98765 43210', birthdayMonth: 11, birthdayDay: 12, consent: true, tags: 'VIP, Regular,vip' });
    expect(c).toMatchObject({ phone: '919876543210', tags: 'vip,regular', consentSource: 'Added by business' });
    await expect(createCustomer(db(), b, { name: 'Dup', phone: '+91 98765-43210' })).rejects.toThrow(/already exists/);
    await expect(createCustomer(db(), b, { name: 'Nobody' })).rejects.toThrow(/mobile number or an email/);
    await expect(createCustomer(db(), b, { name: 'X', phone: '12', consent: true })).rejects.toThrow(/valid mobile/);
    await expect(createCustomer(db(), b, { name: 'X', email: 'x@example.com', birthdayMonth: 2, birthdayDay: 30 })).rejects.toThrow(/does not exist/);
    // Consent time is kept when other details change.
    const u = await updateCustomer(db(), b, c.id, { name: 'Nisha K', phone: '9876543210', tags: 'vip', consent: true }, new Date('2030-01-01'));
    expect(u.consentAt?.getTime()).toBe(c.consentAt?.getTime());
    expect((await listCustomers(db(), b.id, { q: '98765' })).total).toBe(1);
    expect((await listCustomers(db(), b.id, { tag: 'vip' })).total).toBe(1);
    expect((await listCustomers(db(), b.id, { q: '%' })).total).toBe(0);
  });

  it('imports a CSV, updates existing customers and explains skipped rows', async () => {
    const { b } = await setup();
    await createCustomer(db(), b, { name: 'Nisha', phone: '9876543210', consent: true });
    const csv = [
      'Name,Mobile,Email,Birthday,Anniversary,Language,Tags',
      'Nisha Kapoor,98765 43210,,12/11,,en,vip',
      '"Rao, Anil",+44 7700 900123,anil@example.com,1990-03-14,14 Feb,hi,',
      'No Contact,,,,,,',
      'Bad Date,9876500000,,31/02,,,',
      'Meera,9123456789,meera@example.com,March 3,,xx,',
      ',,,,,,'
    ].join('\n');
    await expect(importCustomers(db(), b, csv, { consent: false })).rejects.toThrow(/Confirm/);
    const r = await importCustomers(db(), b, csv, { consent: true }, NOW);
    expect(r).toEqual({ added: 2, updated: 1, skipped: [{ row: 4, reason: 'Add a mobile number or an email' }, { row: 5, reason: 'Couldn’t read birthday “31/02”' }] });
    const all = (await listCustomers(db(), b.id)).customers;
    expect(all.find((c) => c.name === 'Rao, Anil')).toMatchObject({ phone: '447700900123', birthdayMonth: 3, birthdayDay: 14, anniversaryMonth: 2, anniversaryDay: 14, language: 'hi', consentSource: 'CSV import 2026-11-12' });
    expect(all.find((c) => c.name === 'Nisha Kapoor')).toMatchObject({ birthdayMonth: 11, birthdayDay: 12, tags: 'vip' });
    expect(all.find((c) => c.name === 'Meera')?.language).toBe('en');
    await expect(importCustomers(db(), b, 'phone\n123', { consent: true })).rejects.toThrow(/name/);
  });
});

describe('birthday automation', () => {
  async function ready(channel = 'both') {
    const s = await setup();
    await updateAutomation(db(), s.b, 'birthday', { enabled: true, channel, templateId: (await tpl(s.b.id)).id, emailSubject: 'Happy birthday {name}!', emailBody: 'From all of us at {business}, {name}.', sendHour: 9 });
    return s;
  }

  it('sends one WhatsApp birthday message per customer at the send hour, and email when there is no phone', async () => {
    const { b, wa } = await ready();
    await createCustomer(db(), b, { name: 'Nisha Kapoor', phone: '9876543210', birthdayMonth: 11, birthdayDay: 12, consent: true });
    await createCustomer(db(), b, { name: 'Anil Rao', email: 'anil@example.com', birthdayMonth: 11, birthdayDay: 12, consent: true });
    await createCustomer(db(), b, { name: 'No Consent', phone: '9876543211', birthdayMonth: 11, birthdayDay: 12, consent: false });
    await createCustomer(db(), b, { name: 'Tomorrow', phone: '9876543212', birthdayMonth: 11, birthdayDay: 13, consent: true });
    // 08:59 India: too early.
    expect((await runJobs(db(), mailer, new Date('2026-11-12T03:29:00Z'), 'https://app.test', null, wa)).bizQueued).toBe(0);
    const r = await runJobs(db(), mailer, NOW, 'https://app.test', null, wa);
    expect(r).toMatchObject({ bizQueued: 3, bizSent: 2 });
    expect(wa.sent).toEqual([{ creds: { phoneNumberId: '1234567890', token: 'EAAG-good-token-1234567890' }, to: '919876543210', template: 'birthday_wish', language: 'en', params: ['Nisha', 'Sweet Treats'] }]);
    const mail = await db().select().from(outbox);
    expect(mail[0]).toMatchObject({ recipient: 'anil@example.com', subject: 'Happy birthday Anil!' });
    expect(mail[0].body).toContain('From all of us at Sweet Treats, Anil.');
    expect(mail[0].body).toMatch(/https:\/\/app\.test\/u\/[\w-]+/);
    const skipped = await db().select().from(bizMessages).where(eq(bizMessages.status, 'skipped'));
    expect(skipped.map((s) => s.error)).toEqual(['No consent recorded']);
    // Later runs the same day send nothing new.
    expect((await runJobs(db(), mailer, new Date('2026-11-12T10:00:00Z'), 'https://app.test', null, wa)).bizQueued).toBe(0);
    expect(wa.sent).toHaveLength(1);
    expect(await usedThisMonth(db(), b.id, NOW)).toBe(2);
  });

  it('never sends twice with overlapping runners', async () => {
    const { b, wa } = await ready();
    for (let i = 0; i < 12; i++) await createCustomer(db(), b, { name: `C${i}`, phone: `98765432${String(i).padStart(2, '0')}`, birthdayMonth: 11, birthdayDay: 12, consent: true });
    await Promise.all([1, 2, 3].map(() => runJobs(db(), mailer, NOW, 'https://app.test', null, wa)));
    expect(wa.sent).toHaveLength(12);
    expect(new Set(wa.sent.map((s) => s.to)).size).toBe(12);
  });

  it('celebrates 29 February birthdays on 28 February in other years', async () => {
    const { b, wa } = await ready();
    await createCustomer(db(), b, { name: 'Leap', phone: '9876543210', birthdayMonth: 2, birthdayDay: 29, consent: true });
    await runJobs(db(), mailer, new Date('2027-02-28T04:00:00Z'), 'https://app.test', null, wa);
    expect(wa.sent).toHaveLength(1);
  });

  it('falls back to email when WhatsApp refuses, and records the opt-out', async () => {
    const { b } = await ready();
    const c = await createCustomer(db(), b, { name: 'Nisha', phone: '9876543210', email: 'nisha@example.com', birthdayMonth: 11, birthdayDay: 12, consent: true });
    const wa = new FakeWA(() => new WhatsAppError('User stopped marketing messages', 131050, false, true));
    await runJobs(db(), mailer, NOW, 'https://app.test', null, wa);
    await runJobs(db(), mailer, NOW, 'https://app.test', null, wa); // the email fallback goes out
    const [m] = await db().select().from(bizMessages);
    expect(m).toMatchObject({ channel: 'email', status: 'sent', recipient: 'nisha@example.com' });
    expect(m.error).toMatch(/WhatsApp failed/);
    expect((await db().query.customers.findFirst({ where: eq(customers.id, c.id) }))?.waOptOutAt).toBeTruthy();
  });

  it('retries temporary WhatsApp errors with backoff, then gives up', async () => {
    const { b } = await ready('whatsapp');
    await createCustomer(db(), b, { name: 'Nisha', phone: '9876543210', birthdayMonth: 11, birthdayDay: 12, consent: true });
    const wa = new FakeWA(() => new WhatsAppError('Service temporarily unavailable', 131000, true));
    await runJobs(db(), mailer, NOW, 'https://app.test', null, wa);
    let [m] = await db().select().from(bizMessages);
    expect(m).toMatchObject({ status: 'queued', attempts: 1 });
    await runJobs(db(), mailer, new Date(NOW.getTime() + 6 * 60000), 'https://app.test', null, wa);
    await runJobs(db(), mailer, new Date(NOW.getTime() + 30 * 60000), 'https://app.test', null, wa);
    [m] = await db().select().from(bizMessages);
    expect(m).toMatchObject({ status: 'failed', attempts: 3 });
    expect(m.error).toMatch(/\[131000\]/);
  });

  it('stops at the monthly limit', async () => {
    const { b, wa } = await ready();
    await db().update(businesses).set({ monthlyQuota: 2 }).where(eq(businesses.id, b.id));
    for (let i = 0; i < 3; i++) await createCustomer(db(), b, { name: `C${i}`, phone: `987654321${i}`, birthdayMonth: 11, birthdayDay: 12, consent: true });
    await runJobs(db(), mailer, NOW, 'https://app.test', null, wa);
    expect(wa.sent).toHaveLength(2);
    expect((await db().select().from(bizMessages).where(eq(bizMessages.status, 'skipped')))[0].error).toBe('Monthly message limit reached');
  });

  it('honours unsubscribe links and drops anything still queued', async () => {
    const { b } = await ready();
    const c = await createCustomer(db(), b, { name: 'Nisha', phone: '9876543210', email: 'n@example.com', consent: true });
    expect(chooseChannel(b, c, { channel: 'both', template: await tpl(b.id), emailSubject: 's', emailBody: 'b' })).toMatchObject({ channel: 'whatsapp' });
    await unsubscribe(db(), c.unsubscribeToken, { whatsapp: true, email: false });
    const after = (await db().query.customers.findFirst({ where: eq(customers.id, c.id) }))!;
    expect(chooseChannel(b, after, { channel: 'both', template: await tpl(b.id), emailSubject: 's', emailBody: 'b' })).toMatchObject({ channel: 'email' });
    await unsubscribe(db(), c.unsubscribeToken, { whatsapp: true, email: true });
    const gone = (await db().query.customers.findFirst({ where: eq(customers.id, c.id) }))!;
    expect(chooseChannel(b, gone, { channel: 'both', template: await tpl(b.id), emailSubject: 's', emailBody: 'b' })).toEqual({ skip: 'Unsubscribed' });
    await expect(unsubscribe(db(), 'nope', { whatsapp: true, email: true })).rejects.toMatchObject({ status: 404 });
  });
});

describe('campaigns', () => {
  it('sends a scheduled campaign once to customers with the tag who agreed to messages', async () => {
    const { b, wa } = await setup();
    await createCustomer(db(), b, { name: 'VIP One', phone: '9876543210', tags: 'vip', consent: true });
    await createCustomer(db(), b, { name: 'VIP No Consent', phone: '9876543211', tags: 'vip' });
    await createCustomer(db(), b, { name: 'Regular', phone: '9876543212', tags: 'regular', consent: true });
    await createCustomer(db(), b, { name: 'VIP Email', email: 'v@example.com', tags: 'vip', consent: true });
    const sendAt = new Date(NOW.getTime() + 3600000);
    const base = { name: 'Diwali offer', channel: 'both', templateId: (await tpl(b.id)).id, emailSubject: 'Happy Diwali {name}', emailBody: 'Treats await at {business}', tag: 'VIP', sendAt };
    await expect(createCampaign(db(), b, { ...base, sendAt: new Date(NOW.getTime() - 3600000) }, NOW)).rejects.toThrow(/future/);
    await expect(createCampaign(db(), b, { ...base, tag: 'nobody' }, NOW)).rejects.toThrow(/No customers/);
    const c = await createCampaign(db(), b, base, NOW);
    expect(c.audience).toBe(2);
    await runJobs(db(), mailer, NOW, 'https://app.test', null, wa);
    expect(wa.sent).toHaveLength(0);
    await Promise.all([runJobs(db(), mailer, sendAt, 'https://app.test', null, wa), runJobs(db(), mailer, sendAt, 'https://app.test', null, wa)]);
    expect(wa.sent.map((s) => s.to)).toEqual(['919876543210']);
    expect((await db().select().from(outbox)).map((o) => o.subject)).toEqual(['Happy Diwali VIP']);
    expect((await db().query.campaigns.findFirst())?.status).toBe('done');
    await expect(cancelCampaign(db(), b.id, c.id)).rejects.toThrow(/Only scheduled/);
  });

  it('cancelled campaigns never send', async () => {
    const { b, wa } = await setup();
    await createCustomer(db(), b, { name: 'A', phone: '9876543210', consent: true });
    const c = await createCampaign(db(), b, { name: 'X', channel: 'whatsapp', templateId: (await tpl(b.id)).id, sendAt: new Date(NOW.getTime() + 60000) }, NOW);
    await cancelCampaign(db(), b.id, c.id);
    await runJobs(db(), mailer, new Date(NOW.getTime() + 120000), 'https://app.test', null, wa);
    expect(wa.sent).toHaveLength(0);
  });
});

describe('webhook', () => {
  async function sentMessage() {
    const s = await setup();
    await updateAutomation(db(), s.b, 'birthday', { enabled: true, channel: 'whatsapp', templateId: (await tpl(s.b.id)).id, emailSubject: 's', emailBody: 'b', sendHour: 9 });
    await createCustomer(db(), s.b, { name: 'Nisha', phone: '9876543210', birthdayMonth: 11, birthdayDay: 12, consent: true });
    await runJobs(db(), mailer, NOW, 'https://app.test', null, s.wa);
    return s;
  }
  const payload = (value: object, phoneId = '1234567890') => ({ object: 'whatsapp_business_account', entry: [{ id: 'WABA', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { phone_number_id: phoneId }, ...value } }] }] });

  it('moves status forward only, and ignores other businesses’ numbers', async () => {
    await sentMessage();
    const st = (status: string) => payload({ statuses: [{ id: 'wamid.TEST1', status, recipient_id: '919876543210' }] });
    await handleWebhook(db(), st('read'));
    await handleWebhook(db(), st('delivered')); // arrives late
    expect((await db().select().from(bizMessages))[0].status).toBe('read');
    await handleWebhook(db(), payload({ statuses: [{ id: 'wamid.TEST1', status: 'failed' }] }, '999'));
    expect((await db().select().from(bizMessages))[0].status).toBe('read');
  });

  it('records failures with Meta’s reason', async () => {
    await sentMessage();
    await handleWebhook(db(), payload({ statuses: [{ id: 'wamid.TEST1', status: 'failed', errors: [{ code: 131026, title: 'Message undeliverable' }] }] }));
    expect((await db().select().from(bizMessages))[0]).toMatchObject({ status: 'failed', error: '[131026] Message undeliverable' });
  });

  it('opts a customer out when they reply STOP, and back in with START', async () => {
    const { b } = await sentMessage();
    await handleWebhook(db(), payload({ messages: [{ from: '919876543210', id: 'wamid.IN1', type: 'text', text: { body: ' Stop ' } }] }));
    let c = (await listCustomers(db(), b.id)).customers[0];
    expect(c.waOptOutAt).toBeTruthy();
    await handleWebhook(db(), payload({ messages: [{ from: '919876543210', id: 'wamid.IN2', type: 'text', text: { body: 'Thanks for the wishes!' } }] }));
    c = (await listCustomers(db(), b.id)).customers[0];
    expect(c.waOptOutAt).toBeTruthy();
    await handleWebhook(db(), payload({ messages: [{ from: '919876543210', id: 'wamid.IN3', type: 'text', text: { body: 'START' } }] }));
    expect((await listCustomers(db(), b.id)).customers[0].waOptOutAt).toBeNull();
  });
});

describe('dashboard', () => {
  it('counts usage, statuses and upcoming customer dates', async () => {
    const { b, wa } = await setup();
    await updateAutomation(db(), b, 'birthday', { enabled: true, channel: 'whatsapp', templateId: (await tpl(b.id)).id, emailSubject: 's', emailBody: 'b', sendHour: 9 });
    await createCustomer(db(), b, { name: 'Today', phone: '9876543210', birthdayMonth: 11, birthdayDay: 12, consent: true });
    await createCustomer(db(), b, { name: 'Soon', phone: '9876543211', anniversaryMonth: 11, anniversaryDay: 15, consent: true });
    await runJobs(db(), mailer, NOW, 'https://app.test', null, wa);
    const d = await dashboard(db(), b, NOW);
    expect(d).toMatchObject({ used: 1, quota: 1000, customers: 2, consented: 2 });
    expect(d.recent[0]).toMatchObject({ customerName: 'Today' });
    const up = await upcomingCustomerDates(db(), b, 7, NOW);
    expect(up.map((u) => [u.customer.name, u.kind, u.inDays])).toEqual([['Today', 'birthday', 0], ['Soon', 'anniversary', 3]]);
  });
});

describe('business team', () => {
  it('owner invites by email; only that email can join; staff work in the business but not its settings', async () => {
    const { owner, b } = await setup({ connect: false });
    const { inviteStaff, acceptStaffInvite, listTeam, removeStaff, requireBusiness, updateBusiness, previewStaffInvite } = await import('@/server/services/business');
    const staff = await makeUser({ name: 'Sam Staff', email: 'sam@example.com' });
    const other = await makeUser({ email: 'other@example.com' });
    await expect(inviteStaff(db(), staff.id, { email: 'x@example.com' }, mailer, 'https://app.test')).rejects.toMatchObject({ status: 404 });
    const inv = await inviteStaff(db(), owner.id, { email: 'SAM@example.com' }, mailer, 'https://app.test');
    expect((await db().select().from(outbox)).at(-1)?.body).toContain(`/business/join/${inv.token}`);
    expect((await previewStaffInvite(db(), inv.token, other)).status).toBe('wrong_email');
    await expect(acceptStaffInvite(db(), inv.token, other)).rejects.toMatchObject({ code: 'wrong_email' });
    await acceptStaffInvite(db(), inv.token, staff);
    await expect(acceptStaffInvite(db(), inv.token, staff)).rejects.toMatchObject({ status: 410 });
    expect((await requireBusiness(db(), staff.id)).id).toBe(b.id);
    await expect(createCustomer(db(), await requireBusiness(db(), staff.id), { name: 'From staff', email: 's@example.com', consent: true })).resolves.toBeTruthy();
    await expect(updateBusiness(db(), staff.id, { name: 'Renamed' })).rejects.toMatchObject({ status: 403 });
    expect((await listTeam(db(), b)).staff.map((s) => s.name)).toEqual(['Sam Staff']);
    await removeStaff(db(), owner.id, staff.id);
    await expect(requireBusiness(db(), staff.id)).rejects.toMatchObject({ status: 404 });
  });

  it('team size follows the plan (Business plan: 3 logins)', async () => {
    const { owner } = await setup({ connect: false });
    const { inviteStaff } = await import('@/server/services/business');
    await inviteStaff(db(), owner.id, { email: 'a@example.com' }, mailer, 'https://app.test');
    await inviteStaff(db(), owner.id, { email: 'b@example.com' }, mailer, 'https://app.test');
    await expect(inviteStaff(db(), owner.id, { email: 'c@example.com' }, mailer, 'https://app.test')).rejects.toMatchObject({ code: 'plan_limit' });
  });
});
