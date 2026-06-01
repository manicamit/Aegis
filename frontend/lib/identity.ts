import 'server-only';
import { proxyToFastAPI } from './api-client';
import type { ApiIdentityResponse } from './identity-shared';

export type { ApiIdentityResponse } from './identity-shared';

export async function fetchIdentityClusters(refresh = false): Promise<ApiIdentityResponse> {
  const qs = refresh ? '?refresh=true' : '';
  const res = await proxyToFastAPI(`/api/v1/identity/clusters${qs}`);
  if (!res.ok) throw new Error(`/api/v1/identity/clusters → ${res.status}`);
  return (await res.json()) as ApiIdentityResponse;
}
