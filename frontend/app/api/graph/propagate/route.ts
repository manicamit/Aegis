import { NextResponse } from 'next/server';
import { proxyToFastAPI } from '@/lib/api-client';

export async function POST(request: Request) {
  const body = await request.json();
  const { searchParams } = new URL(request.url);
  const alpha = searchParams.get('alpha') ?? '0.85';
  const res = await proxyToFastAPI(
    `/api/v1/graph/propagate?alpha=${alpha}`,
    { method: 'POST', body: JSON.stringify(body) }
  );
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
