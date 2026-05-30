import 'server-only';
import { proxyToFastAPI } from './api-client';
import type { AuditFamily, AuditTrailResponse } from './audit-shared';

export type { AuditFamily, AuditTrailResponse, AuditRow, AuditIntegrity } from './audit-shared';

export interface FetchAuditOptions {
  limit?:  number;
  offset?: number;
  family?: AuditFamily;
  search?: string;
}

export async function fetchAuditTrail(opts: FetchAuditOptions = {}): Promise<AuditTrailResponse> {
  const params = new URLSearchParams();
  if (opts.limit  != null) params.set('limit',  String(opts.limit));
  if (opts.offset != null) params.set('offset', String(opts.offset));
  if (opts.family && opts.family !== 'ALL') params.set('family', opts.family);
  if (opts.search) params.set('search', opts.search);
  const qs = params.toString();
  const res = await proxyToFastAPI(`/api/v1/audit/trail${qs ? `?${qs}` : ''}`);
  if (!res.ok) throw new Error(`/api/v1/audit/trail → ${res.status}`);
  return (await res.json()) as AuditTrailResponse;
}
