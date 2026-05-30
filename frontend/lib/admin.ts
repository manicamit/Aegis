import 'server-only';
import { proxyToFastAPI } from './api-client';
import type {
  AdminApiKeysResponse,
  AdminConfigResponse,
  AdminPermissionsResponse,
  AdminUsersResponse,
} from './admin-shared';

export type * from './admin-shared';

async function getJSON<T>(path: string): Promise<T> {
  const res = await proxyToFastAPI(path);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()) as T;
}

export async function fetchAdminUsers(): Promise<AdminUsersResponse> {
  return getJSON<AdminUsersResponse>('/api/v1/admin/users');
}

export async function fetchAdminPermissions(): Promise<AdminPermissionsResponse> {
  return getJSON<AdminPermissionsResponse>('/api/v1/admin/permissions');
}

export async function fetchAdminApiKeys(): Promise<AdminApiKeysResponse> {
  return getJSON<AdminApiKeysResponse>('/api/v1/admin/api-keys');
}

export async function fetchAdminConfig(): Promise<AdminConfigResponse> {
  return getJSON<AdminConfigResponse>('/api/v1/admin/config');
}
