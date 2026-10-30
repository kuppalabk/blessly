/**
 * Runs reminder planning/delivery and scheduled sends every minute.
 * In production, either run this as a worker process or call POST /api/cron from a scheduler.
 */
import { getDb } from '../src/server/db';
import { runJobsRecorded } from '../src/server/services/jobs';
import { emailProviderFromEnv } from '../src/server/providers/email';

const once = process.argv.includes('--once');

async function tick() {
  try {
    const r = await runJobsRecorded(getDb(), emailProviderFromEnv());
    if (Object.values(r).some(Boolean)) console.log(new Date().toISOString(), r);
  } catch (e) {
    console.error('[jobs] run failed', e);
  }
}

(async () => {
  await tick();
  if (once) process.exit(0);
  setInterval(tick, 60_000);
})();
