// Server-only graph fetchers. Imports `proxyToFastAPI` (which uses next/headers),
// so this module must never be pulled into the client bundle. Client Components
// should import types and pure helpers from `./graph-shared` instead.
import 'server-only';
import { proxyToFastAPI } from './api-client';
import type {
  ApiEgoResponse,
  ApiSankeyResponse,
  ApiPropagationResponse,
} from './graph-shared';

export type {
  ApiEgoResponse,
  ApiSankeyResponse,
  ApiPropagationResponse,
} from './graph-shared';

export async function fetchEgo(accountId: string, radius = 2): Promise<ApiEgoResponse | null> {
  const res = await proxyToFastAPI(`/api/v1/graph/ego/${encodeURIComponent(accountId)}?radius=${radius}`);
  if (res.status === 404 || res.status === 503) return null;
  if (!res.ok) throw new Error(`/api/v1/graph/ego/${accountId} → ${res.status}`);
  return (await res.json()) as ApiEgoResponse;
}

export async function fetchSankey(accountId: string, maxHops = 3): Promise<ApiSankeyResponse | null> {
  const res = await proxyToFastAPI(`/api/v1/graph/sankey/${encodeURIComponent(accountId)}?max_hops=${maxHops}`);
  if (res.status === 404 || res.status === 503) return null;
  if (!res.ok) throw new Error(`/api/v1/graph/sankey/${accountId} → ${res.status}`);
  return (await res.json()) as ApiSankeyResponse;
}

export async function fetchPropagation(
  seeds: string[],
  alpha = 0.85,
): Promise<ApiPropagationResponse | null> {
  if (seeds.length === 0) return null;
  const res = await proxyToFastAPI(`/api/v1/graph/propagate?alpha=${alpha}`, {
    method: 'POST',
    // FastAPI signature: `seed_accounts: list[str] = []` → body is a JSON array.
    body:   JSON.stringify(seeds),
  });
  if (res.status === 503 || res.status === 400 || res.status === 404) return null;
  if (!res.ok) throw new Error(`/api/v1/graph/propagate → ${res.status}`);
  return (await res.json()) as ApiPropagationResponse;
}
