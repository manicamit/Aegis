export function fmtINR(n: number): string {
  return '₹' + n.toLocaleString('en-IN');
}

export function ringColor(risk: number): string {
  if (risk >= 0.75) return 'var(--danger)';
  if (risk >= 0.5)  return 'var(--warn)';
  return 'var(--approved)';
}

export function riskColor(risk: number): string {
  if (risk >= 0.75) return '#b53848';
  if (risk >= 0.5)  return '#a96b16';
  return '#1a7d52';
}

export function shade(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
