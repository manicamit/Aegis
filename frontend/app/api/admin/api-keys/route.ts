import { NextResponse } from 'next/server';
import { proxyToFastAPI } from '@/lib/api-client';

export const dynamic = 'force-dynamic';

export async function GET() {
  const res = await proxyToFastAPI('/api/v1/admin/api-keys');
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function POST(request: Request) {
  const body = await request.text();
  const res = await proxyToFastAPI('/api/v1/admin/api-keys', {
    method: 'POST',
    body,
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
