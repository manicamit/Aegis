import { NextResponse } from 'next/server';
import { proxyToFastAPI } from '@/lib/api-client';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ accountId: string }> }
) {
  const { accountId } = await params;
  const res = await proxyToFastAPI(`/api/v1/alerts/${accountId}`);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
