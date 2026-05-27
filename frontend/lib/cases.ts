import { proxyToFastAPI } from './api-client';
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
  risk_score: number;
  risk_factors: string[];
  str_narrative: string;
  transaction_count: number;
  total_amount: number;
  evidence: ApiCaseEvidence;
  generated_at: string;
  system_version: string;
  compliance: ApiCaseCompliance;
}

interface ApiCaseList {
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

function maskAccount(ref: string): string {
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

export function adaptCase(c: ApiCase): CaseRow {
  const score = Math.round(c.risk_score);
  return {
    id:           c.case_id,
    primaryAlert: c.account_reference,
    masked:       maskAccount(c.account_reference),
    bank:         'Account ' + c.account_reference.slice(0, 4),
    priority:     score,
    risk:         score,
    collapsed:    Math.max(1, c.transaction_count || 1),
    topRule:      topRuleFromFactors(c.risk_factors),
    amount:       c.total_amount,
    age:          relativeAge(c.generated_at),
    status:       'new',
    overdue:      false,
    assigned:     'Unassigned',
  };
}

export async function fetchCases(limit = 50): Promise<CaseRow[]> {
  const res = await proxyToFastAPI(`/api/v1/cases/?limit=${limit}`);
  if (!res.ok) throw new Error(`/api/v1/cases/ → ${res.status}`);
  const data = (await res.json()) as ApiCaseList;
  return data.cases.map(adaptCase);
}

export async function fetchCase(caseId: string): Promise<ApiCase | null> {
  const res = await proxyToFastAPI(`/api/v1/cases/${encodeURIComponent(caseId)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`/api/v1/cases/${caseId} → ${res.status}`);
  return (await res.json()) as ApiCase;
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
