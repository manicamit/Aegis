export type UserRole = 'investigator' | 'analyst' | 'admin' | 'branch_manager';
export type NodeType = 'account' | 'upi' | 'device' | 'branch' | 'ip' | 'merchant';
export type SignalType = 'device' | 'ip' | 'beneficiary' | 'upi' | 'phone';
export type ClusterSeverity = 'danger' | 'warn' | 'info';
export type ServiceStatus = 'ok' | 'degraded' | 'down';

export interface Case {
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
  status: 'new' | 'in-progress' | 'escalated' | 'closed';
  overdue: boolean;
  assigned: string;
}

export interface FatfRule {
  code: string;
  title: string;
  note: string;
  tone: 'danger' | 'warn';
}

export interface CaseDossier {
  id: string;
  masked: string;
  bank: string;
  branch?: string;
  assigned: string;
  status: string;
  score: number;
  totalMoved: number;
  txCount: number;
  dateRange: string;
  fatfRules: FatfRule[];
}

export interface TransactionLog {
  kind: 'ok' | 'warn' | 'now';
  title: string;
  at: string;
}

export interface Transaction {
  id: string;
  date: string;
  time: string;
  recipient: string;
  bank: string;
  country: string;
  status: 'complete' | 'pending' | 'error' | 'flagged';
  amount: number;
  type: 'credit' | 'debit';
  flagged?: boolean;
  payment?: { method: string; credit: string; txType: string };
  profile?: { fullName: string; account: string; accountType: string };
  bankProfile?: { bank: string; city: string; country: string; bankId: string };
  log?: TransactionLog[];
  invest?: { opened: string; agent: string; stage: number };
}

export interface GraphNode {
  id: string;
  label: string;
  sub: string;
  type: NodeType;
  risk: number;
  x: number;
  y: number;
  r: number;
  node_type?: string;
  bank?: string;
  risk_score?: number;
  is_center?: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
  amount: number;
  label?: string;
  currency?: string;
  timestamp?: number;
  edge_type?: string;
  is_laundering?: number;
}

export interface EgoNetworkResponse {
  center: string;
  radius: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
  node_count: number;
  edge_count: number;
}

export interface ShapFeature {
  feat: string;
  v: number;
  raw: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
  meta: string;
}

export interface CaseNote {
  id: number;
  title: string;
  team: string;
  date: string;
}

export interface Entity {
  name: string;
  kind: 'Recipient' | 'Institution' | 'Processor' | 'Endpoint' | 'Merchant';
  color: string;
}

export interface AuditEvent {
  ts: string;
  tm: string;
  evt: string;
  actor: string;
  name: string;
  role: string;
  ref: string;
  desc: string;
  hash: string;
  hashVal: string;
  prev: string;
  broken: boolean;
  payload: string;
}

export interface ServiceMetric { k: string; v: string; u: string }

export interface ServiceHealth {
  id: string;
  name: string;
  sub: string;
  status: ServiceStatus;
  icon: string;
  metrics: ServiceMetric[];
  spark: number[];
  uptime: string;
  lastCheck: string;
  note?: string;
}

export interface IdentityAccount {
  id: string;
  label: string;
  bank: string;
  cluster: string;
  flagged: boolean;
  x: number;
  y: number;
}

export interface IdentityLink {
  a: string;
  b: string;
  type: SignalType;
}

export interface IdentityCluster {
  id: string;
  title: string;
  density: number;
  severity: ClusterSeverity;
  accounts: string[];
  signals: SignalType[];
}

export interface AuthSession {
  username: string;
  role: UserRole;
  token?: string;
}

export interface STRDossier {
  caseId: string;
  masked: string;
  bank: string;
  branch: string;
  score: number;
  generated: string;
  version: string;
  prompt: string;
  model: string;
  source: 'pre-generated' | 'live';
  reviewer: string;
  fatf: [string, string][];
  nistRMF: string[];
  shap: [string, string, string][];
  tx: [string, string, string, string][];
  graph: {
    layering: number;
    circular: boolean;
    flaggedNeighbours: number;
    dormancy: string;
    branches: number;
  };
  totals: {
    total: string;
    count: number;
    window: string;
    channels: string;
  };
}

export interface Alert {
  Account: string;
  risk_score: number;
  risk_label: string;
  case?: CaseDossier;
}
