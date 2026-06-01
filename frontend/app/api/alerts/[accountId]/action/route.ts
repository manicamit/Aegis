import { NextResponse } from 'next/server';
import { proxyToFastAPI } from '@/lib/api-client';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> }
) {
  const { accountId } = await params;
  const body = await request.text();
  const res = await proxyToFastAPI(`/api/v1/alerts/${accountId}/action`, {
    method: 'POST',
    body,
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
