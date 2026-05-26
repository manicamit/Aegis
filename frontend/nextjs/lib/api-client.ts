import { cookies } from 'next/headers';

const FASTAPI = process.env.FASTAPI_URL ?? 'http://localhost:8000';

export async function proxyToFastAPI(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const cookieStore = await cookies();
  const token = cookieStore.get('aegis_token')?.value;
  return fetch(`${FASTAPI}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((init?.headers as Record<string, string>) ?? {}),
    },
  });
}
