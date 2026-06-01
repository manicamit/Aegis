// Types + pure adapters for cases. Safe to import from Client Components —
// must not depend on `lib/api-client` (which uses `next/headers`).
import type { FatfRule } from '@/types/aegis';
import type { WorkspaceCase } from './workspace-data';

export interface ApiCaseEvidence {
  sankey_json: unknown;
  ego_network_json: unknown;
}

export interface ApiCaseCompliance {
  fatf_rules_triggered: string[];
  nist_rmf_alignment: string;
}

export interface ApiCase {
  case_id: string;
  account_reference: string;
  account_id?: string;
  risk_score: number;
  plain_english?: string;
  risk_factors: string[];
  str_narrative: string;
  transaction_count: number;
  total_amount: number;
  evidence: ApiCaseEvidence;
  generated_at: string;
  system_version: string;
  compliance: ApiCaseCompliance;
  priority_score?: number;
  n_alerts_collapsed?: number;
  rules_triggered?: string[];
  status?: 'pending' | 'approved' | 'flagged' | 'frozen' | 'closed' | 'escalated' | 'new' | 'in-progress';
  assigned_to?: string;
  actioned_at?: number;
  actioned_by_role?: string;
}

export interface ApiCaseList {
  total: number;
  cases: ApiCase[];
}

export type CaseStatus = 'new' | 'in-progress' | 'escalated' | 'closed';

export interface CaseRow {
  id: string;
  primaryAlert: string;
  masked: string;
  bank: string;
  priority: number;
  risk: number;
  collapsed: number;
  topRule: string;
  amount: number;
  age: string;
  status: CaseStatus;
  overdue: boolean;
  assigned: string;
}

export interface QueueAlert {
  case_id: string;
  account_id?: string;
  plain_english?: string;
  priority_score?: number;
  risk_score?: number;
  rules_triggered?: string[];
  n_alerts_collapsed?: number;
  total_amount?: number;
  transaction_count?: number;
  assigned_role: string;
  sla_remaining_seconds: number;
  age_seconds: number;
  escalated: boolean;
}

export interface AlertQueueResponse {
  role: string;
  total: number;
  alerts: QueueAlert[];
}

export interface ActionResponse {
  case_id: string;
  action: 'approve' | 'flag' | 'freeze';
  audit_hash: string;
  timestamp: number;
  actor_role: string;
  status: string;
}

export function maskAccount(ref: string): string {
  if (ref.length <= 4) return 'XXXX-XX-' + ref;
  return 'XXXX-XX-' + ref.slice(-4);
}

function relativeAge(generatedAt: string): string {
  const then = new Date(generatedAt).getTime();
  if (!Number.isFinite(then)) return '—';
  const diffMs = Date.now() - then;
  const days = Math.floor(diffMs / 86_400_000);
  const hours = Math.floor((diffMs % 86_400_000) / 3_600_000);
  if (days >= 1) return `${days}d · ${hours}h`;
  const minutes = Math.floor((diffMs % 3_600_000) / 60_000);
  return `${hours}h · ${minutes}m`;
}

function topRuleFromFactors(factors: string[]): string {
  if (factors.length === 0) return '—';
  return factors[0].replace(/^\+\s*/, '').replace(/\s*\(impact: [^)]+\)$/, '');
}

function topRuleFromAggregation(c: ApiCase): string {
  if (c.rules_triggered && c.rules_triggered.length > 0) {
    return c.rules_triggered[0].replace(/^rule_/, '').replace(/_/g, ' ');
  }
  return topRuleFromFactors(c.risk_factors);
}

function statusFromCase(c: ApiCase): CaseRow['status'] {
  const s = c.status ?? 'new';
  if (s === 'approved' || s === 'flagged' || s === 'frozen') return 'closed';
  if (s === 'escalated') return 'escalated';
  if (s === 'pending' || s === 'new') return 'new';
  if (s === 'in-progress' || s === 'closed') return s as CaseRow['status'];
  return 'new';
}

export function adaptCase(c: ApiCase): CaseRow {
  const priority = c.priority_score != null
    ? Math.round(c.priority_score * 100)
    : Math.round(c.risk_score);
  const collapsed = c.n_alerts_collapsed ?? Math.max(1, c.transaction_count || 1);
  return {
    id:           c.case_id,
    primaryAlert: c.account_id ?? c.account_reference,
    masked:       maskAccount(c.account_id ?? c.account_reference),
    bank:         'Account ' + (c.account_id ?? c.account_reference).slice(0, 4),
    priority,
    risk:         Math.round(c.risk_score),
    collapsed,
    topRule:      topRuleFromAggregation(c),
    amount:       c.total_amount,
    age:          relativeAge(c.generated_at),
    status:       statusFromCase(c),
    overdue:      false,
    assigned:     c.assigned_to ?? 'Unassigned',
  };
}

function fatfRulesFromApi(codes: string[]): FatfRule[] {
  if (codes.length === 0) return [];
  const danger = new Set(['FATF-R10', 'FATF-R16']);
  return codes.map(code => ({
    code,
    title: code,
    note: 'Triggered by AEGIS pipeline',
    tone: danger.has(code) ? 'danger' : 'warn',
  }));
}

function dateRangeFromGenerated(generatedAt: string): string {
  const then = new Date(generatedAt);
  if (Number.isNaN(then.getTime())) return '—';
  const start = new Date(then.getTime() - 21 * 86_400_000);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
  return `${fmt(start)} → ${fmt(then)}, ${then.getFullYear()}`;
}

export function adaptToWorkspaceCase(c: ApiCase): WorkspaceCase {
  return {
    id:         c.case_id,
    masked:     maskAccount(c.account_reference),
    bank:       `Account ${c.account_reference}`,
    assigned:   'Unassigned',
    status:     'In Review',
    score:      Math.round(c.risk_score),
    totalMoved: c.total_amount,
    txCount:    c.transaction_count,
    dateRange:  dateRangeFromGenerated(c.generated_at),
    fatfRules:  fatfRulesFromApi(c.compliance.fatf_rules_triggered),
  };
}
