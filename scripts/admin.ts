/**
 * Grants or removes platform admin rights. Admin rights are never granted from inside the app.
 *   npm run admin -- grant someone@example.com
 *   npm run admin -- revoke someone@example.com
 *   npm run admin -- list
 */
import { eq } from 'drizzle-orm';
import { getDb, closeDb } from '../src/server/db';
import { users } from '../src/server/schema';

async function main() {
  const [cmd, email] = process.argv.slice(2);
  const db = getDb();
  if (cmd === 'list') {
    for (const u of await db.select().from(users).where(eq(users.role, 'admin'))) console.log(`${u.email}\t${u.name}`);
  } else if ((cmd === 'grant' || cmd === 'revoke') && email) {
    const [u] = await db.update(users).set({ role: cmd === 'grant' ? 'admin' : 'user' }).where(eq(users.email, email.trim().toLowerCase())).returning();
    if (!u) { console.error(`No account with email ${email}. They need to sign up first.`); process.exitCode = 1; }
    else console.log(`${u.email} is now ${u.role === 'admin' ? 'a platform admin' : 'a regular user'}.`);
  } else {
    console.error('Usage: npm run admin -- grant|revoke <email>   or   npm run admin -- list');
    process.exitCode = 1;
  }
  await closeDb();
}
main();
