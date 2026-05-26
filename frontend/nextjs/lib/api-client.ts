const FASTAPI = process.env.FASTAPI_URL ?? 'http://localhost:8000';

export async function proxyToFastAPI(
  path: string,
  token: string | undefined,
  init?: RequestInit
): Promise<Response> {
  return fetch(`${FASTAPI}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((init?.headers as Record<string, string>) ?? {}),
    },
  });
}
