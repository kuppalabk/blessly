import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db, resetDb } from './helpers';
import { closeDb } from '@/server/db';
import { dbHit } from '@/server/http';

beforeEach(resetDb);
afterAll(closeDb);

describe('shared rate limiter (postgres)', () => {
  it('counts every hit exactly once, even when they arrive at the same moment from different servers', async () => {
    const now = new Date('2026-11-01T00:00:00Z');
    const counts = await Promise.all(Array.from({ length: 20 }, () => dbHit('login:1.2.3.4', 60000, db(), now)));
    expect(counts.sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it('starts a fresh window once the old one has ended', async () => {
    const t = new Date('2026-11-01T00:00:00Z');
    await dbHit('k', 60000, db(), t);
    expect(await dbHit('k', 60000, db(), new Date(t.getTime() + 30000))).toBe(2);
    expect(await dbHit('k', 60000, db(), new Date(t.getTime() + 61000))).toBe(1);
  });
});
