import { NextResponse } from 'next/server';
import { proxyToFastAPI } from '@/lib/api-client';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ keyId: string }> },
) {
  const { keyId } = await params;
  const res = await proxyToFastAPI(`/api/v1/admin/api-keys/${keyId}`, {
    method: 'DELETE',
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
