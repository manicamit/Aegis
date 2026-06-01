import {
  fetchAdminApiKeys,
  fetchAdminConfig,
  fetchAdminPermissions,
  fetchAdminUsers,
  type AdminApiKeysResponse,
  type AdminConfigResponse,
  type AdminPermissionsResponse,
  type AdminUsersResponse,
} from '@/lib/admin';
import { fetchAuditTrail, type AuditTrailResponse } from '@/lib/audit';
import { SettingsView } from './SettingsView';

export const dynamic = 'force-dynamic';

interface PageData {
  users:       AdminUsersResponse;
  permissions: AdminPermissionsResponse;
  apiKeys:     AdminApiKeysResponse;
  config:      AdminConfigResponse;
  audit:       AuditTrailResponse;
}

const EMPTY: PageData = {
  users:       { rows: [], total: 0, suspended: 0, invited: 0 },
  permissions: { roles: ['analyst', 'investigator', 'admin'], rows: [], note: '' },
  apiKeys:     { rows: [], total: 0 },
  config:      {
    rate_limiting: { requests_per_minute: '—', burst: '—', concurrent_investigations: '—', str_per_hour: '—' },
    session:       { jwt_expiry_minutes: 0, idle_timeout_minutes: 0, mfa_required_for: '—' },
    paths:         { audit_log: '—', model_dir: '—', data_dir: '—', pending_alerts: '—', api_keys: '—' },
    escalation:    { timeout_seconds: 0, tick_seconds: 0, webhook_url: '' },
  },
  audit: {
    rows: [], total: 0, limit: 8, offset: 0, family_counts: {},
    integrity: {
      total_entries: 0, verified_window: 0, anomalies: [],
      head_hash: null, head_prev: null, last_timestamp: null,
    },
    generated_at: 0,
  },
};

export default async function SettingsPage() {
  const settled = await Promise.allSettled([
    fetchAdminUsers(),
    fetchAdminPermissions(),
    fetchAdminApiKeys(),
    fetchAdminConfig(),
    fetchAuditTrail({ limit: 8 }),
  ]);
  const pick = <T,>(i: number, fallback: T): T =>
    settled[i].status === 'fulfilled' ? (settled[i] as PromiseFulfilledResult<T>).value : fallback;
  const data: PageData = {
    users:       pick(0, EMPTY.users),
    permissions: pick(1, EMPTY.permissions),
    apiKeys:     pick(2, EMPTY.apiKeys),
    config:      pick(3, EMPTY.config),
    audit:       pick(4, EMPTY.audit),
  };
  return <SettingsView data={data} />;
}
