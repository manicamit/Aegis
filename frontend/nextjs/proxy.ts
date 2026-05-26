import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ADMIN_PATHS = ['/audit', '/heartbeat', '/escalation', '/benchmarks', '/settings'];

// Phase 1: auth check is disabled until the /api/auth/login route sets cookies (Phase 2).
// When Phase 2 is complete, un-comment the token check below.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === '/login') return NextResponse.next();

  // TODO (Phase 2): un-comment when /api/auth/login sets aegis_token cookie
  // const token = request.cookies.get('aegis_token')?.value;
  // if (!token) return NextResponse.redirect(new URL('/login', request.url));

  const role = request.cookies.get('aegis_role')?.value;
  const isAdminPath = ADMIN_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'));
  if (isAdminPath && role !== 'admin') {
    return NextResponse.redirect(new URL('/alerts', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
