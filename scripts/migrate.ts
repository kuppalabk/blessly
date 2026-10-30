import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { getDb, closeDb } from '../src/server/db';

async function main() {
  await migrate(getDb(), { migrationsFolder: 'drizzle' });
  console.log('Migrations applied to', process.env.DATABASE_URL?.replace(/:[^:@/]*@/, ':***@'));
  await closeDb();
}
main().catch((e) => { console.error(e); process.exit(1); });
