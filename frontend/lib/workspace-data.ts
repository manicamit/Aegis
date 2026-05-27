import type { FatfRule, GraphNode, GraphEdge, ShapFeature } from '@/types/aegis';

export interface WorkspaceCase {
  id: string;
  masked: string;
  bank: string;
  assigned: string;
  status: string;
  score: number;
  totalMoved: number;
  txCount: number;
  dateRange: string;
  fatfRules: FatfRule[];
}

export const WORKSPACE_CASE: WorkspaceCase = {
  id: 'AGS-2027H',
  masked: 'XXXX-XX-9126',
  bank: 'Yes Bank · Mumbai · Bandra-W',
  assigned: 'Agent Smith',
  status: 'In Review',
  score: 94,
  totalMoved: 842000,
  txCount: 38,
  dateRange: 'May 03 → May 24, 2026',
  fatfRules: [
    { code: 'FATF-R10', title: 'Structuring',           note: '12 deposits ≤ ₹49 999 in 4h window',             tone: 'danger' },
    { code: 'FATF-R20', title: 'Dormant activation',    note: 'Account inactive 217 days, reactivated 21h ago', tone: 'warn' },
    { code: 'FATF-R32', title: 'Fan-in fan-out',        note: '8 inbound · 7 outbound counterparties',          tone: 'warn' },
    { code: 'FATF-R16', title: 'Cross-border layering', note: '3 hops through high-risk corridor JP→KH→IN',     tone: 'danger' },
  ],
};

export const SHAP_FEATURES: ShapFeature[] = [
  { feat: 'Coordinated burst transfer · 12 tx in 4h',     v:  0.28, raw: 'burst_score = 0.91' },
  { feat: 'Dormant account activated 21h pre-burst',      v:  0.22, raw: 'dormancy_days = 217' },
  { feat: 'GAT proximity to confirmed mule cluster S-19', v:  0.19, raw: 'gat_risk = 0.74' },
  { feat: 'Layering depth · 6 hops to cash-out',          v:  0.15, raw: 'hop_count = 6' },
  { feat: 'Sub-threshold deposit pattern',                v:  0.11, raw: 'structuring_score = 0.83' },
  { feat: 'Shared device · 4 linked accounts',            v:  0.09, raw: 'device_link_ct = 4' },
  { feat: 'Geo-IP mismatch (login vs txn)',               v:  0.07, raw: 'geo_delta_km = 1820' },
  { feat: 'KYC re-verified within last 30 days',          v: -0.04, raw: 'kyc_age_d = 9' },
  { feat: 'Recipient on internal allow-list',             v: -0.06, raw: 'allowlist = true' },
  { feat: 'Salary credit history · 28 months',            v: -0.08, raw: 'salary_months = 28' },
];

export const EGO_NODES: GraphNode[] = [
  { id: 'C',  label: 'Flagged account', sub: 'AGS-2027H · ₹8.4L moved', type: 'account',  risk: 94, x: 360, y: 260, r: 22 },
  { id: 'M1', label: 'ACME Imports',    sub: 'Acct ·8841 · ICICI',      type: 'account',  risk: 78, x: 200, y: 150, r: 14 },
  { id: 'M2', label: 'Hayao Miyazaki',  sub: 'Acct ·1234 · Osaka',      type: 'account',  risk: 62, x: 540, y: 140, r: 14 },
  { id: 'M3', label: 'UPI@swiftpay',    sub: 'VPA handle',              type: 'upi',      risk: 81, x: 180, y: 330, r: 12 },
  { id: 'M4', label: 'Device 0xA94CF',  sub: 'Linux · Pixel 7',         type: 'device',   risk: 86, x: 560, y: 350, r: 12 },
  { id: 'M5', label: 'Bandra-West br.', sub: 'Yes Bank · 0291',         type: 'branch',   risk: 22, x: 360, y: 100, r: 11 },
  { id: 'M6', label: '203.0.113.84',    sub: 'IP · Mumbai VPN exit',    type: 'ip',       risk: 71, x: 360, y: 430, r: 11 },
  { id: 'M7', label: 'Quick Cash Mart', sub: 'Merchant · MCC 6010',     type: 'merchant', risk: 67, x:  90, y: 240, r: 11 },
  { id: 'F1', label: 'Mule cluster S-19', sub: '5 linked accts',        type: 'account',  risk: 91, x:  80, y:  80, r: 14 },
  { id: 'F2', label: 'Acct ·5503',      sub: 'Axis · Pune',             type: 'account',  risk: 58, x: 640, y:  60, r: 11 },
  { id: 'F3', label: 'Acct ·9082',      sub: 'HDFC · Pune',             type: 'account',  risk: 64, x: 690, y: 220, r: 11 },
  { id: 'F4', label: 'Acct ·1199',      sub: 'Kotak · Mumbai',          type: 'account',  risk: 41, x:  90, y: 430, r: 10 },
  { id: 'F5', label: 'Watchlist hit',   sub: 'FIU-IND case 8821',       type: 'account',  risk: 99, x: 670, y: 460, r: 13 },
  { id: 'F6', label: 'Acct ·6620',      sub: 'PNB · Ludhiana',          type: 'account',  risk: 33, x: 280, y: 470, r: 10 },
];

export const EGO_EDGES: GraphEdge[] = [
  { source: 'C',  target: 'M1', amount: 250000, label: 'IMPS · ₹2.5L · May 18' },
  { source: 'C',  target: 'M2', amount: 180000, label: 'NEFT · ₹1.8L · May 19' },
  { source: 'C',  target: 'M3', amount:  92000, label: 'UPI · ₹92k · May 21' },
  { source: 'C',  target: 'M4', amount:  60000, label: 'UPI · ₹60k · May 22' },
  { source: 'C',  target: 'M5', amount:  40000, label: 'Counter · ₹40k · May 12' },
  { source: 'C',  target: 'M6', amount:  88000, label: 'UPI · ₹88k · May 22' },
  { source: 'C',  target: 'M7', amount: 132000, label: 'POS · ₹1.3L · May 23' },
  { source: 'M1', target: 'F1', amount:  44000, label: 'RTGS · ₹44k · May 20' },
  { source: 'M1', target: 'F2', amount:  88000, label: 'NEFT · ₹88k · May 20' },
  { source: 'M2', target: 'F3', amount: 120000, label: 'Wire · ₹1.2L · May 21' },
  { source: 'M4', target: 'F5', amount:  60000, label: 'UPI · ₹60k · May 23' },
  { source: 'M3', target: 'F4', amount:  80000, label: 'UPI · ₹80k · May 22' },
  { source: 'M7', target: 'F6', amount: 110000, label: 'Cash-out · ₹1.1L · May 23' },
  { source: 'M1', target: 'M3', amount:  20000, label: 'Internal · ₹20k' },
  { source: 'M2', target: 'F5', amount:  30000, label: 'Wire · ₹30k' },
];

export const TYPE_COLOR: Record<string, string> = {
  account:  '#e76edd',
  upi:      '#22d3ee',
  device:   '#2ad1c3',
  branch:   '#a78bfa',
  ip:       '#fbbf24',
  merchant: '#f08a5d',
};

export const riskColor = (r: number): string => {
  if (r >= 80) return '#ef5b6b';
  if (r >= 60) return '#e9a13b';
  if (r >= 40) return '#fbbf24';
  return '#34d399';
};

export interface ReplayHop {
  i: number;
  from: string;
  to: string;
  amount: number;
  format: string;
  at: string;
  delta: number;
  bump: number;
  fromLabel: string;
  toLabel: string;
}

export const REPLAY_HOPS: ReplayHop[] = [
  { i: 1, from: 'S',  to: 'M1', amount: 250000, format: 'IMPS', at: 'May 18 · 14:02', delta:  6, bump: 58, fromLabel: 'AGS-2027H',      toLabel: 'ACME Imports' },
  { i: 2, from: 'S',  to: 'M2', amount: 180000, format: 'NEFT', at: 'May 19 · 11:48', delta:  8, bump: 66, fromLabel: 'AGS-2027H',      toLabel: 'Hayao Miyazaki' },
  { i: 3, from: 'M1', to: 'F1', amount:  44000, format: 'RTGS', at: 'May 20 · 09:12', delta: 12, bump: 78, fromLabel: 'ACME Imports',   toLabel: 'Mule cluster S-19' },
  { i: 4, from: 'M2', to: 'F3', amount: 120000, format: 'WIRE', at: 'May 21 · 02:14', delta:  4, bump: 82, fromLabel: 'Hayao Miyazaki', toLabel: 'Acct ·9082' },
  { i: 5, from: 'S',  to: 'M3', amount:  92000, format: 'UPI',  at: 'May 21 · 22:31', delta:  3, bump: 85, fromLabel: 'AGS-2027H',      toLabel: 'UPI@swiftpay' },
  { i: 6, from: 'M3', to: 'F4', amount:  80000, format: 'UPI',  at: 'May 22 · 06:05', delta:  2, bump: 87, fromLabel: 'UPI@swiftpay',   toLabel: 'Acct ·1199' },
  { i: 7, from: 'S',  to: 'M7', amount: 132000, format: 'POS',  at: 'May 23 · 10:18', delta:  5, bump: 92, fromLabel: 'AGS-2027H',      toLabel: 'Quick Cash Mart' },
  { i: 8, from: 'M7', to: 'F6', amount: 110000, format: 'CASH', at: 'May 23 · 11:42', delta:  2, bump: 94, fromLabel: 'Quick Cash Mart', toLabel: 'Acct ·6620' },
];

export interface ReplayNodePos { x: number; y: number; role: 'source' | 'bridge' | 'terminus' }

export const REPLAY_POS: Record<string, ReplayNodePos> = {
  S:  { x: 360, y: 280, role: 'source' },
  M1: { x: 200, y: 160, role: 'bridge' },
  M2: { x: 540, y: 160, role: 'bridge' },
  M3: { x: 200, y: 400, role: 'bridge' },
  M7: { x: 540, y: 400, role: 'bridge' },
  F1: { x:  80, y:  80, role: 'terminus' },
  F3: { x: 660, y:  80, role: 'terminus' },
  F4: { x:  80, y: 480, role: 'terminus' },
  F6: { x: 660, y: 480, role: 'terminus' },
};

export const REPLAY_NODE_INFO: Record<string, { label: string; sub: string }> = {
  S:  { label: 'AGS-2027H',     sub: 'Source' },
  M1: { label: 'ACME Imports',  sub: 'Bridge' },
  M2: { label: 'Hayao Miyazaki', sub: 'Bridge' },
  M3: { label: 'UPI@swiftpay',  sub: 'Bridge' },
  M7: { label: 'Quick Cash Mart', sub: 'Bridge' },
  F1: { label: 'Cluster S-19',  sub: 'Terminus' },
  F3: { label: 'Acct ·9082',    sub: 'Terminus' },
  F4: { label: 'Acct ·1199',    sub: 'Terminus' },
  F6: { label: 'Acct ·6620',    sub: 'Cash-out' },
};
