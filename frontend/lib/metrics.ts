import { proxyToFastAPI } from './api-client';

export interface BenchmarkResponse {
  headers: [string, string, string];
  rows: [string, string | number, string | number][];
  dataset?: string;
  citation?: string;
}

export interface BenchmarkRow {
  metric:    string;
  ruleRaw:   string | number;
  aegisRaw:  string | number;
  ruleNum:   number | null;
  aegisNum:  number | null;
  delta:     string;
  ruleStr:   string;
  aegisStr:  string;
  aegisBetter: boolean | null;
}

export interface BenchmarkPayload {
  rows:     BenchmarkRow[];
  dataset:  string | null;
  citation: string | null;
}

const HIGHER_IS_WORSE = new Set(['False Positive Rate', 'Alert Reduction']);

function parseNumeric(v: string | number): number | null {
  if (typeof v === 'number') return v;
  const cleaned = v.replace(/[~×x,\s]/g, '').replace(/^baseline$/i, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function formatValue(v: string | number, isPercent: boolean): string {
  if (typeof v === 'string') return v;
  if (isPercent) return (v * 100).toFixed(1) + '%';
  return v.toFixed(3);
}

function computeDelta(metric: string, ruleNum: number | null, aegisNum: number | null): { delta: string; better: boolean | null } {
  if (ruleNum == null || aegisNum == null || ruleNum === 0) return { delta: '—', better: null };
  const pct = ((aegisNum - ruleNum) / Math.abs(ruleNum)) * 100;
  const sign = pct >= 0 ? '+' : '−';
  const magnitude = Math.abs(pct).toFixed(1);
  const better = HIGHER_IS_WORSE.has(metric) ? pct < 0 : pct > 0;
  return { delta: `${sign}${magnitude}%`, better };
}

export function adaptBenchmark(data: BenchmarkResponse): BenchmarkRow[] {
  return data.rows.map(([metric, rule, aegis]) => {
    const ruleNum  = parseNumeric(rule);
    const aegisNum = parseNumeric(aegis);
    const { delta, better } = computeDelta(metric, ruleNum, aegisNum);
    return {
      metric,
      ruleRaw: rule,
      aegisRaw: aegis,
      ruleNum,
      aegisNum,
      delta,
      ruleStr:  formatValue(rule, false),
      aegisStr: formatValue(aegis, false),
      aegisBetter: better,
    };
  });
}

export async function fetchBenchmark(): Promise<BenchmarkPayload> {
  const res = await proxyToFastAPI('/api/v1/metrics/benchmark');
  if (!res.ok) throw new Error(`/api/v1/metrics/benchmark → ${res.status}`);
  const data = (await res.json()) as BenchmarkResponse;
  return {
    rows:     adaptBenchmark(data),
    dataset:  data.dataset  ?? null,
    citation: data.citation ?? null,
  };
}
