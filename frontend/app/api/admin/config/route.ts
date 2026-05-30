import { NextResponse } from 'next/server';
import { proxyToFastAPI } from '@/lib/api-client';

export const dynamic = 'force-dynamic';

export async function GET() {
  const res = await proxyToFastAPI('/api/v1/admin/config');
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
