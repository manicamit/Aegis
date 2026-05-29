// Server-only fetchers for cases. Uses `proxyToFastAPI` (next/headers), so this
// module must not be pulled into the client bundle. Client Components should
// import types from `./cases-shared` and use `./cases-client` for fetching.
import 'server-only';
import { proxyToFastAPI } from './api-client';
import type {
  ApiCase,
  ApiCaseList,
  AlertQueueResponse,
  ActionResponse,
  CaseRow,
} from './cases-shared';
import { adaptCase } from './cases-shared';

export type {
  ApiCase,
  ApiCaseList,
  ApiCaseEvidence,
  ApiCaseCompliance,
  AlertQueueResponse,
  ActionResponse,
  CaseRow,
  CaseStatus,
  QueueAlert,
} from './cases-shared';
export { adaptCase, adaptToWorkspaceCase, maskAccount } from './cases-shared';

export async function fetchCases(limit = 50): Promise<CaseRow[]> {
  const res = await proxyToFastAPI(`/api/v1/cases/?limit=${limit}`);
  if (!res.ok) throw new Error(`/api/v1/cases/ → ${res.status}`);
  const data = (await res.json()) as ApiCaseList;
  return data.cases.map(adaptCase);
}

export async function fetchRawCases(limit = 50): Promise<ApiCase[]> {
  const res = await proxyToFastAPI(`/api/v1/cases/?limit=${limit}`);
  if (!res.ok) throw new Error(`/api/v1/cases/ → ${res.status}`);
  const data = (await res.json()) as ApiCaseList;
  return data.cases;
}

export async function fetchAlertQueue(
  role: string = 'branch_manager',
  limit: number = 20,
): Promise<AlertQueueResponse> {
  const res = await proxyToFastAPI(
    `/api/v1/alerts/queue?role=${encodeURIComponent(role)}&limit=${limit}`,
  );
  if (!res.ok) throw new Error(`/api/v1/alerts/queue → ${res.status}`);
  return (await res.json()) as AlertQueueResponse;
}

export async function postAlertAction(
  caseId: string,
  action: 'approve' | 'flag' | 'freeze',
  note?: string,
): Promise<ActionResponse> {
  const res = await proxyToFastAPI(`/api/v1/alerts/${encodeURIComponent(caseId)}/action`, {
    method: 'POST',
    body: JSON.stringify({ action, note: note ?? '' }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`alert action ${res.status}: ${detail}`);
  }
  return (await res.json()) as ActionResponse;
}

export async function fetchCase(caseId: string): Promise<ApiCase | null> {
  const res = await proxyToFastAPI(`/api/v1/cases/${encodeURIComponent(caseId)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`/api/v1/cases/${caseId} → ${res.status}`);
  return (await res.json()) as ApiCase;
}
