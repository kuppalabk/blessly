import type { DB } from '../db';
import { notifications } from '../schema';

type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];

/** Adds an in-app alert for each user. The job runner then delivers it as a push notification. */
export async function notify(db: DB | Tx, userIds: string[], n: { title: string; body: string; link?: string | null }) {
  const ids = [...new Set(userIds)];
  if (!ids.length) return;
  await db.insert(notifications).values(ids.map((userId) => ({ userId, title: n.title.slice(0, 200), body: n.body.slice(0, 500), link: n.link ?? null })));
}
