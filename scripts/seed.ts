/** Creates a demo account (demo@blessly.local / demo-password) with a few people. Safe to re-run. */
import { eq } from 'drizzle-orm';
import { getDb, closeDb } from '../src/server/db';
import { users } from '../src/server/schema';
import { signUp } from '../src/server/services/auth';
import { createPerson } from '../src/server/services/people';
import { acceptInvite, createEvent, createFamily, createInvite, createTask, setRsvp } from '../src/server/services/family';
import { toISO } from '../src/lib/dates';
import { createBusiness, createCustomer, getMyBusiness, updateAutomation } from '../src/server/services/business';
import { todayIn, addDays } from '../src/lib/dates';

async function main() {
  const db = getDb();
  const email = 'demo@blessly.local';
  if (await db.query.users.findFirst({ where: eq(users.email, email) })) {
    console.log('Demo account already exists:', email);
    return closeDb();
  }
  const u = await signUp(db, { name: 'Kiran Sharma', email, password: 'demo-password', timezone: 'Asia/Kolkata', country: 'IN' });
  const t = todayIn(u.timezone);
  const soon = (n: number) => { const d = addDays(t, n); return { month: d.m, day: d.d }; };
  const people = [
    { name: 'Nisha Kapoor', relationship: 'Best friend', phone: '98765 43210', language: 'en', notes: 'loves trekking', occasions: [{ kind: 'birthday', ...soon(3) }] },
    { name: 'Rohan Sharma', relationship: 'Brother', language: 'hi', occasions: [{ kind: 'anniversary', ...soon(9) }, { kind: 'birthday', month: 1, day: 10 }] },
    { name: 'Anaya Sharma', relationship: 'Daughter', language: 'en', occasions: [{ kind: 'birthday', ...soon(20) }] },
    { name: 'Meera Iyer', relationship: 'Colleague', language: 'ta', email: 'meera@example.com', occasions: [{ kind: 'work_anniversary', ...soon(35) }] },
    { name: 'Fatima Khan', relationship: 'Friend', language: 'ur', occasions: [{ kind: 'birthday', month: 4, day: 9 }] }
  ];
  for (const p of people) await createPerson(db, u.id, p, u.timezone);

  // Family Circle: a second account, a shared grandparent, an event with RSVPs and tasks.
  const fam = await createFamily(db, u.id, { name: 'The Sharmas' });
  const aarav = await signUp(db, { name: 'Aarav Sharma', email: 'aarav@blessly.local', password: 'demo-password', timezone: 'Asia/Kolkata', country: 'IN' });
  await acceptInvite(db, aarav.id, (await createInvite(db, u.id, fam.id, { role: 'member' })).token);
  const dadi = await createPerson(db, u.id, { name: 'Dadi Sharma', relationship: 'Grandparent', language: 'hi', familyId: fam.id, occasions: [{ kind: 'birthday', ...soon(12) }] }, u.timezone);
  const ev = await createEvent(db, u.id, fam.id, { title: "Dadi's 80th birthday dinner", occasion: 'birthday', eventDate: toISO(addDays(t, 12)), eventTime: '19:30', place: 'Home, Pune', personId: dadi.id });
  await setRsvp(db, u.id, ev.id, { status: 'going' });
  await setRsvp(db, aarav.id, ev.id, { status: 'maybe' });
  await createTask(db, u.id, fam.id, { title: 'Order the cake', assigneeId: aarav.id, eventId: ev.id });
  await createTask(db, u.id, fam.id, { title: 'Book the photographer', assigneeId: u.id, eventId: ev.id });
  await createTask(db, aarav.id, fam.id, { title: 'Collect old family photos' });

  // Business: a bakery with customers and email birthday wishes switched on (connect WhatsApp in Business → Settings).
  await createBusiness(db, u.id, { name: 'Sweet Treats Bakery', timezone: 'Asia/Kolkata', country: 'IN' });
  const biz = (await getMyBusiness(db, u.id))!;
  const custs = [
    { name: 'Meera Joshi', phone: '98200 11111', email: 'meera@example.com', birthdayMonth: soon(0).month, birthdayDay: soon(0).day, tags: 'vip', consent: true },
    { name: 'Rahul Verma', phone: '98200 22222', birthdayMonth: soon(2).month, birthdayDay: soon(2).day, tags: 'regular', consent: true },
    { name: 'Sara Thomas', email: 'sara@example.com', anniversaryMonth: soon(4).month, anniversaryDay: soon(4).day, tags: 'vip', consent: true },
    { name: 'Imran Shaikh', phone: '98200 33333', birthdayMonth: 3, birthdayDay: 21, consent: false }
  ];
  for (const c of custs) await createCustomer(db, biz, c);
  await updateAutomation(db, biz, 'birthday', { enabled: true, channel: 'both', templateId: null, emailSubject: 'Happy birthday, {name}!', emailBody: 'Wishing you a sweet birthday, {name}! Show this email for a free pastry today. — {business}', sendHour: 9 });
  // The demo account is also a platform admin, so the admin area can be explored.
  await db.update(users).set({ role: 'admin' }).where(eq(users.id, u.id));
  console.log(`Demo accounts created: ${email} and aarav@blessly.local (password demo-password), ${people.length + 1} people, 1 family circle; demo is a platform admin`);
  await closeDb();
}
main().catch((e) => { console.error(e); process.exit(1); });
