import { cfg } from '@/server/settings';
import { NextResponse } from 'next/server';

/**
 * Digital Asset Links for the Android app (a Trusted Web Activity wrapping this PWA, e.g. built with PWABuilder or Bubblewrap).
 * Set ANDROID_PACKAGE (e.g. app.blessly.twa) and ANDROID_SHA256_FINGERPRINTS (comma-separated, from Play Console → App signing).
 */
export function GET() {
  const pkg = cfg('ANDROID_PACKAGE');
  const prints = (cfg('ANDROID_SHA256_FINGERPRINTS') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const body = pkg && prints.length ? [{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: pkg, sha256_cert_fingerprints: prints } }] : [];
  return NextResponse.json(body, { headers: { 'cache-control': 'public, max-age=3600' } });
}
