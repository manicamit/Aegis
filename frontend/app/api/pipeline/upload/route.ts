import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const FASTAPI = process.env.FASTAPI_URL ?? 'http://localhost:8000';

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get('aegis_token')?.value;
  const formData = await request.formData();

  const upstream = await fetch(`${FASTAPI}/api/v1/pipeline/upload-and-train`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  const data = await upstream.json();
  return NextResponse.json(data, { status: upstream.status });
}
