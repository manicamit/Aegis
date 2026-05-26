import { NextResponse } from 'next/server';

const FASTAPI = process.env.FASTAPI_URL ?? 'http://localhost:8000';

export async function GET() {
  try {
    const res = await fetch(`${FASTAPI}/api/v1/health`, { cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ status: 'unreachable' }, { status: 503 });
  }
}
