import type { SignalType, ClusterSeverity } from '@/types/aegis';

export interface ApiSignalDef {
  id:    SignalType;
  label: string;
  color: string;
}

export interface ApiAccountNode {
  id:      string;
  label:   string;
  bank:    string;
  cluster: string;
  flagged: boolean;
}

export interface ApiIdentityLink {
  a:    string;
  b:    string;
  type: SignalType;
}

export interface ApiIdentityCluster {
  id:       string;
  title:    string;
  density:  number;
  severity: ClusterSeverity;
  accounts: string[];
  signals:  SignalType[];
  size:     number;
}

export interface ApiIdentityResponse {
  accounts:     ApiAccountNode[];
  links:        ApiIdentityLink[];
  clusters:     ApiIdentityCluster[];
  signals:      ApiSignalDef[];
  generated_at: number;
  source:       string;
}

export interface PositionedAccount extends ApiAccountNode {
  x: number;
  y: number;
}

export interface ClusterBox {
  cluster: ApiIdentityCluster;
  x:       number;
  y:       number;
  w:       number;
  h:       number;
}

/**
 * Lay out accounts grouped by cluster as a row of cluster cards on a canvas.
 * Each cluster's accounts are arranged on a small circle inside the card.
 */
export function layoutIdentity(payload: ApiIdentityResponse, W = 720, H = 560) {
  const clusters = payload.clusters;
  if (clusters.length === 0) {
    return { accounts: [] as PositionedAccount[], boxes: [] as ClusterBox[] };
  }
  // Lay out cluster boxes in a flowing 2-row grid.
  const perRow = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(clusters.length))));
  const rows = Math.ceil(clusters.length / perRow);
  const boxW = (W - 60) / perRow;
  const boxH = (H - 60) / rows;
  const boxes: ClusterBox[] = [];
  const accounts: PositionedAccount[] = [];

  clusters.forEach((c, idx) => {
    const col = idx % perRow;
    const row = Math.floor(idx / perRow);
    const x = 30 + col * boxW;
    const y = 30 + row * boxH;
    boxes.push({ cluster: c, x, y, w: boxW - 12, h: boxH - 12 });

    const inThis = payload.accounts.filter(a => a.cluster === c.id);
    const cx = x + (boxW - 12) / 2;
    const cy = y + (boxH - 12) / 2 + 10;
    const r  = Math.min(boxW, boxH) * 0.28;
    inThis.forEach((a, i) => {
      const theta = (i / Math.max(1, inThis.length)) * Math.PI * 2 - Math.PI / 2;
      accounts.push({
        ...a,
        x: cx + r * Math.cos(theta),
        y: cy + r * Math.sin(theta),
      });
    });
  });
  return { accounts, boxes };
}

export function sevColor(s: ClusterSeverity): string {
  return s === 'danger' ? '#ef5b6b' : s === 'warn' ? '#e9a13b' : '#34d399';
}
