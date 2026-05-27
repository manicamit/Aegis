import { NextResponse } from 'next/server';

const FASTAPI = process.env.FASTAPI_URL ?? 'http://localhost:8000';

export async function POST(request: Request) {
  const { username, password } = await request.json();

  if (!username || !password) {
    return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
  }

  const params = new URLSearchParams({ username, password });
  const upstream = await fetch(`${FASTAPI}/api/v1/auth/login?${params}`, {
    method: 'POST',
  });

  if (!upstream.ok) {
    const err = await upstream.json().catch(() => ({ detail: 'Login failed' }));
    return NextResponse.json(
      { error: err.detail ?? 'Invalid credentials' },
      { status: upstream.status }
    );
  }

  const { access_token, role } = await upstream.json();

  const response = NextResponse.json({ role });

  const maxAge = 8 * 60 * 60; // 8 hours, matches "keep me signed in" UX copy
  response.cookies.set('aegis_token', access_token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
  response.cookies.set('aegis_role', role, {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge,
  });

  return response;
}
