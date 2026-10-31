import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

function post(headers: Record<string, string>) {
  return new NextRequest('https://blessly.test/api/auth/login', { method: 'POST', headers: { host: 'blessly.test', ...headers } });
}

describe('cross-site protection for API writes', () => {
  it('blocks a browser POST from another site', () => {
    const res = middleware(post({ origin: 'https://evil.example' }));
    expect(res.status).toBe(403);
  });

  it('blocks a POST with no origin and no native header', () => {
    expect(middleware(post({})).status).toBe(403);
  });

  it('allows the native app (x-client: native, no origin)', () => {
    expect(middleware(post({ 'x-client': 'native' })).status).not.toBe(403);
  });

  it('allows the website on its own origin', () => {
    expect(middleware(post({ origin: 'https://blessly.test' })).status).not.toBe(403);
  });

  it('does not let the native header override a foreign origin', () => {
    expect(middleware(post({ 'x-client': 'native', origin: 'https://evil.example' })).status).toBe(403);
  });
});
