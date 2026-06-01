import { NextResponse } from 'next/server';

const FASTAPI = process.env.FASTAPI_URL ?? 'http://localhost:8000';

const KNOWN_ROLES = new Set(['branch_manager', 'investigator', 'analyst', 'admin']);

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const submittedRole = typeof body.role === 'string' ? body.role : undefined;
  const submittedUsername = typeof body.username === 'string' ? body.username : undefined;

  const role = submittedRole && KNOWN_ROLES.has(submittedRole)
    ? submittedRole
    : (submittedUsername && KNOWN_ROLES.has(submittedUsername) ? submittedUsername : 'investigator');

  const upstream = await fetch(`${FASTAPI}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, username: submittedUsername ?? role }),
  });

  if (!upstream.ok) {
    const err = await upstream.json().catch(() => ({ detail: 'Login failed' }));
    return NextResponse.json(
      { error: err.detail ?? 'Login failed' },
      { status: upstream.status }
    );
  }

  const upstreamJson = await upstream.json();
  const accessToken = upstreamJson.access_token as string;
  const effectiveRole = (upstreamJson.role as string | undefined) ?? role;

  const response = NextResponse.json({ role: effectiveRole });

  const maxAge = 8 * 60 * 60; // 8 hours, matches "keep me signed in" UX copy
  response.cookies.set('aegis_token', accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
  response.cookies.set('aegis_role', effectiveRole, {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge,
  });

  return response;
}
