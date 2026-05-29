// Types and pure helpers for graph visualisations.
// This module is import-safe for Client Components — it must not depend on
// `lib/api-client` (which uses `next/headers`).

export interface ApiGraphNode {
  id: string;
  node_type: string;
  bank: string;
  risk_score: number;
  is_center: boolean;
}

export interface ApiGraphEdge {
  source: string;
  target: string;
  amount: number;
  currency: string;
  timestamp: number;
  edge_type: string;
  is_laundering: number;
}

export interface ApiEgoResponse {
  center:     string;
  radius:     number;
  nodes:      ApiGraphNode[];
  edges:      ApiGraphEdge[];
  node_count: number;
  edge_count: number;
}

export interface ApiSankeyPath {
  source:    string;
  target:    string;
  amount:    number;
  hop_index: number;
}

export interface ApiSankeyResponse {
  account:      string;
  max_hops:     number;
  paths:        ApiSankeyPath[];
  total_nodes:  number;
  total_links:  number;
}

export interface ApiPropagationResponse {
  seed_nodes:      string[];
  alpha:           number;
  top_risks:       Array<{ account: string; risk_score: number }>;
  total_affected:  number;
}

function stripAccPrefix(id: string): string {
  return id.startsWith('ACC_') ? id.slice(4) : id;
}

export function shortLabel(id: string): string {
  const stripped = stripAccPrefix(id);
  if (stripped.length <= 6) return stripped;
  return '·' + stripped.slice(-4);
}

export interface LaidOutNode {
  id:    string;
  label: string;
  sub:   string;
  type:  string;
  risk:  number;
  x:     number;
  y:     number;
  r:     number;
  isCenter: boolean;
}

export interface LaidOutEdge {
  source: string;
  target: string;
  amount: number;
  label:  string;
}

/**
 * Compute a radial layout for the ego graph: center node at the middle,
 * everything else placed on a single ring sized by node count.
 */
export function layoutEgo(ego: ApiEgoResponse, width = 720, height = 520): {
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
} {
  const cx = width / 2;
  const cy = height / 2;
  const ringR = Math.min(width, height) * 0.36;

  const center = ego.nodes.find(n => n.is_center);
  const others = ego.nodes.filter(n => !n.is_center);

  const nodes: LaidOutNode[] = [];
  if (center) {
    nodes.push({
      id:       center.id,
      label:    shortLabel(center.id),
      sub:      center.bank || center.node_type,
      type:     center.node_type || 'account',
      risk:     Math.round(center.risk_score),
      x:        cx,
      y:        cy,
      r:        22,
      isCenter: true,
    });
  }
  others.forEach((n, i) => {
    const angle = (i / Math.max(1, others.length)) * Math.PI * 2 - Math.PI / 2;
    nodes.push({
      id:       n.id,
      label:    shortLabel(n.id),
      sub:      n.bank || n.node_type || '',
      type:     n.node_type || 'account',
      risk:     Math.round(n.risk_score),
      x:        cx + Math.cos(angle) * ringR,
      y:        cy + Math.sin(angle) * ringR,
      r:        n.risk_score >= 75 ? 14 : 12,
      isCenter: false,
    });
  });

  const edges: LaidOutEdge[] = ego.edges.map(e => {
    const ts = e.timestamp ? new Date(e.timestamp * 1000).toLocaleDateString('en-US', { month: 'short', day: '2-digit' }) : '';
    const label = [e.edge_type, e.amount ? `₹${(e.amount / 1000).toFixed(0)}k` : '', ts]
      .filter(Boolean).join(' · ');
    return {
      source: e.source,
      target: e.target,
      amount: e.amount,
      label,
    };
  });

  return { nodes, edges };
}

export interface SankeyColumn {
  label: string;
  items: Array<{ id: string; label: string; amount: number }>;
}

/**
 * Bucket sankey paths into 3 visual columns: Source (hop 0 inbound), Bridges (mid hops),
 * Cash-out (terminal hops). Aggregates duplicate targets.
 */
export function layoutSankey(sankey: ApiSankeyResponse): {
  source:   SankeyColumn;
  bridges:  SankeyColumn;
  cashOut:  SankeyColumn;
  total:    number;
} {
  const sourceId = sankey.account.startsWith('ACC_') ? sankey.account : `ACC_${sankey.account}`;
  const maxHop = sankey.paths.reduce((m, p) => Math.max(m, p.hop_index), 0);

  const firstHop = sankey.paths.filter(p => p.hop_index === 0);
  const total = firstHop.reduce((sum, p) => sum + p.amount, 0);

  const aggregate = (paths: ApiSankeyPath[]): SankeyColumn['items'] => {
    const map = new Map<string, number>();
    paths.forEach(p => map.set(p.target, (map.get(p.target) ?? 0) + p.amount));
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id, amount]) => ({ id, label: shortLabel(id), amount }));
  };

  const bridges = aggregate(sankey.paths.filter(p => p.hop_index > 0 && p.hop_index < maxHop));
  const cashOut = aggregate(sankey.paths.filter(p => p.hop_index === maxHop && maxHop > 0));

  return {
    source: {
      label: 'Source',
      items: [{ id: sourceId, label: shortLabel(sourceId), amount: total }],
    },
    bridges: { label: 'Bridges',  items: bridges },
    cashOut: { label: 'Cash-out', items: cashOut },
    total,
  };
}

export interface ReplayHopLite {
  i:      number;
  from:   string;
  to:     string;
  amount: number;
  hop:    number;
}

export function sankeyToReplay(sankey: ApiSankeyResponse): ReplayHopLite[] {
  return sankey.paths
    .slice()
    .sort((a, b) => a.hop_index - b.hop_index || b.amount - a.amount)
    .map((p, i) => ({
      i:      i + 1,
      from:   p.source,
      to:     p.target,
      amount: p.amount,
      hop:    p.hop_index,
    }));
}
