export type AuditFamily = 'ALL' | 'LOGIN' | 'STR' | 'CASE' | 'SYSTEM' | 'API' | 'EXPORT' | 'OTHER';

export interface AuditRow {
  id:               string;
  event:            string;
  family:           AuditFamily;
  timestamp:        number;
  actor:            string;
  actor_role:       string;
  case_ref:         string;
  description:      string;
  hash:             string;
  hash_short:       string;
  prev_hash:        string;
  prev_hash_short:  string;
  block_index:      number;
  details:          Record<string, unknown>;
}

export interface AuditIntegrity {
  total_entries:   number;
  verified_window: number;
  anomalies:       { reason: string; event?: string; timestamp?: number }[];
  head_hash:       string | null;
  head_prev:       string | null;
  last_timestamp:  number | null;
}

export interface AuditTrailResponse {
  rows:          AuditRow[];
  total:         number;
  limit:         number;
  offset:        number;
  family_counts: Record<string, number>;
  integrity:     AuditIntegrity;
  generated_at:  number;
}

const FAMILY_TONE: Record<AuditFamily, string> = {
  ALL: '',
  LOGIN: '',
  STR: 'e-str',
  CASE: '',
  SYSTEM: 'e-system',
  API: 'e-flag',
  EXPORT: 'e-export',
  OTHER: '',
};

export function familyTone(f: AuditFamily): string {
  return FAMILY_TONE[f] ?? '';
}

export function shortHash(h: string | null | undefined): string {
  if (!h || h.length < 8) return h ?? '—';
  return `0x${h.slice(0, 4)}…${h.slice(-4)}`;
}

export function formatTimestamp(ts: number): { date: string; time: string } {
  if (!ts) return { date: '—', time: '' };
  const d = new Date(ts * 1000);
  const date = d.toISOString().slice(0, 10);
  const time = d.toISOString().slice(11, 19);
  return { date, time };
}

export function actorInitials(actor: string): string {
  if (!actor) return '??';
  const parts = actor.replace(/[._@]/g, ' ').split(' ').filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
