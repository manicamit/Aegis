import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set('aegis_token', '', { maxAge: 0, path: '/' });
  response.cookies.set('aegis_role', '', { maxAge: 0, path: '/' });
  return response;
}
