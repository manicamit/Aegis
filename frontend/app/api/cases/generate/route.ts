import { NextResponse } from 'next/server';
import { proxyToFastAPI } from '@/lib/api-client';

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get('account_id') ?? '';
  const res = await proxyToFastAPI(
    `/api/v1/cases/generate?account_id=${encodeURIComponent(accountId)}`,
    { method: 'POST' }
  );
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
