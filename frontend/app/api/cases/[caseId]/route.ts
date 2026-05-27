import { NextResponse } from 'next/server';
import { proxyToFastAPI } from '@/lib/api-client';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ caseId: string }> }
) {
  const { caseId } = await params;
  const res = await proxyToFastAPI(`/api/v1/cases/${caseId}`);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
