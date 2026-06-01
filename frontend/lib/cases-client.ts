// Client-side fetchers. These hit the LOCAL Next.js Route Handlers (which
// internally use `proxyToFastAPI`) — keeping the JWT cookie flow server-side
// and the `next/headers` import out of the browser bundle.
import type { AlertQueueResponse, ActionResponse } from './cases-shared';

export async function fetchAlertQueue(
  role: string = 'branch_manager',
  limit: number = 20,
): Promise<AlertQueueResponse> {
  const res = await fetch(
    `/api/alerts/queue?role=${encodeURIComponent(role)}&limit=${limit}`,
    { credentials: 'include' },
  );
  if (!res.ok) throw new Error(`/api/alerts/queue → ${res.status}`);
  return (await res.json()) as AlertQueueResponse;
}

export async function postAlertAction(
  caseId: string,
  action: 'approve' | 'flag' | 'freeze',
  note?: string,
): Promise<ActionResponse> {
  const res = await fetch(
    `/api/alerts/${encodeURIComponent(caseId)}/action`,
    {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify({ action, note: note ?? '' }),
    },
  );
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`alert action ${res.status}: ${detail}`);
  }
  return (await res.json()) as ActionResponse;
}
