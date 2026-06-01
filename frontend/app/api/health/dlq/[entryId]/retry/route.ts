import { NextResponse } from 'next/server';
import { proxyToFastAPI } from '@/lib/api-client';

export const dynamic = 'force-dynamic';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ entryId: string }> }
) {
  const { entryId } = await params;
  const res = await proxyToFastAPI(`/api/v1/health/dlq/${entryId}/retry`, {
    method: 'POST',
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
