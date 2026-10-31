import { describe, expect, it } from 'vitest';
import { databaseUrlForPool } from '@/server/db';

describe('databaseUrlForPool', () => {
  it('leaves droplet and local URLs unchanged', () => {
    const url = 'postgres://blessly:secret@db:5432/blessly';
    expect(databaseUrlForPool(url)).toBe(url);
  });

  it('adds libpq compatibility so App Platform sslmode=require can connect', () => {
    expect(databaseUrlForPool('postgresql://doadmin:s@db.example:25060/defaultdb?sslmode=require'))
      .toBe('postgresql://doadmin:s@db.example:25060/defaultdb?sslmode=require&uselibpqcompat=true');
  });

  it('keeps verify-full, a pinned CA, and an existing libpq flag as written', () => {
    const already = 'postgres://u:p@h/db?sslmode=require&uselibpqcompat=true';
    expect(databaseUrlForPool(already)).toBe(already);
    const ca = 'postgres://u:p@h/db?sslmode=require&sslrootcert=/ca.pem';
    expect(databaseUrlForPool(ca)).toBe(ca);
    const full = 'postgres://u:p@h/db?sslmode=verify-full';
    expect(databaseUrlForPool(full)).toBe(full);
  });
});
