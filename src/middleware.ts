import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PAGES = ['/', '/login', '/login/2fa', '/login/phone', '/signup', '/forgot', '/cards', '/offline', '/pricing', '/privacy', '/terms'];
const PUBLIC_PREFIXES = ['/w/', '/u/', '/reset/', '/a/', '/c/', '/l/', '/p/', '/g/', '/pay/', '/r/'];

/**
 * - Blocks cross-site state-changing API requests (CSRF) by checking the Origin header.
 * - Sends logged-out visitors to /login for app pages (the page itself re-checks the session).
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const method = req.method.toUpperCase();

  if (pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(method) && pathname !== '/api/cron' && !pathname.startsWith('/api/webhooks/') && !/^\/api\/auth\/oauth\/[a-z]+\/callback$/.test(pathname)) {
    const origin = req.headers.get('origin');
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
    // The native apps send no Origin, but they send a custom x-client header. A browser cannot send
    // that header to another site without a preflight, which this server never allows.
    const nativeApp = req.headers.get('x-client') === 'native' && !origin;
    if (!nativeApp && (!origin || !host || new URL(origin).host !== host)) {
      return NextResponse.json({ error: 'Cross-site request blocked', code: 'csrf' }, { status: 403 });
    }
  }

  // Read-only support view: an admin is looking at a user's account. Nothing may be changed.
  if (req.cookies.get('ww_admin_session') && pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(method)
      && pathname !== '/api/admin/view-as' && !pathname.startsWith('/api/auth/')) {
    return NextResponse.json({ error: 'This is a read-only support view. Exit it to make changes.', code: 'read_only' }, { status: 403 });
  }

  const isPage = !pathname.startsWith('/api/') && !pathname.startsWith('/_next') && !pathname.includes('.');
  const isPublic = PUBLIC_PAGES.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
  if (isPage && !isPublic && !req.cookies.get('ww_session')) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|art/|photos/|icons/).*)'] };
