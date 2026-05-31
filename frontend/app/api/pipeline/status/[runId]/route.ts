import { NextResponse } from 'next/server';
import { proxyToFastAPI } from '@/lib/api-client';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const { searchParams } = new URL(request.url);
  const qs = searchParams.toString();
  const res = await proxyToFastAPI(
    `/api/v1/pipeline/status/${encodeURIComponent(runId)}${qs ? `?${qs}` : ''}`,
  );
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
