'use client';

import { useMemo, useState } from 'react';
import { Topbar } from '@/components/nav/Topbar';
import { Icon } from '@/components/shared/Icon';
import type { BenchmarkPayload, BenchmarkRow } from '@/lib/metrics';

interface KpiCard {
  k:   string;
  row: BenchmarkRow | null;
}

const KPI_DEFS: Array<{ label: string; metric: string }> = [
  { label: 'ROC-AUC',        metric: 'ROC-AUC' },
  { label: 'Precision',      metric: 'Precision' },
  { label: 'Recall',         metric: 'Recall' },
  { label: 'F1 Score',       metric: 'F1 Score' },
  { label: 'False Pos Rate', metric: 'False Positive Rate' },
];

function SparkPlaceholder({ better }: { better: boolean | null }) {
  // Sparkline history requires a time-series endpoint that does not exist yet.
  // Render a flat trend bar coloured by current Δ direction.
  const color = better === true ? 'var(--approved)' : better === false ? 'var(--danger)' : 'var(--ink-3)';
  return (
    <svg viewBox="0 0 200 40" width="100%" height="40" className="spark" preserveAspectRatio="none">
      <line x1={0} x2={200} y1={20} y2={20} stroke={color} strokeWidth={2} strokeDasharray="4 4" opacity={0.6} />
    </svg>
  );
}

interface VolumeRow { d: string; total: number; tp: number; fp: number }

function AlertVolumeChart({ data }: { data: VolumeRow[] }) {
  const W = 640, H = 220;
  const padL = 40, padR = 8, padT = 12, padB = 28;
  if (data.length === 0) {
    return (
      <div style={{ height: 220, display: 'grid', placeItems: 'center', color: 'var(--ink-3)', fontSize: 12 }}>
        No time-series data
      </div>
    );
  }
  const max = Math.max(...data.map(d => d.total));
  const x = (i: number) => padL + (i / (data.length - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB);

  const pathFor = (key: 'total' | 'tp' | 'fp', color: string) => {
    const d = data.map((row, i) => (i === 0 ? 'M' : 'L') + x(i) + ' ' + y(row[key])).join(' ');
    return <path d={d} fill="none" stroke={color} strokeWidth="2.5" />;
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxHeight: 260 }} preserveAspectRatio="xMidYMid meet">
      {[0, 0.25, 0.5, 0.75, 1].map(t => (
        <g key={t}>
          <line x1={padL} x2={W - padR} y1={padT + t * (H - padT - padB)} y2={padT + t * (H - padT - padB)} stroke="var(--line)" strokeWidth="1" strokeDasharray={t === 1 ? 'none' : '2 4'} />
          <text x={padL - 6} y={padT + t * (H - padT - padB) + 3} textAnchor="end" fontFamily="'JetBrains Mono'" fontSize="9" fill="var(--ink-3)">
            {Math.round(max * (1 - t))}
          </text>
        </g>
      ))}

      <path
        d={data.map((row, i) => (i === 0 ? 'M' : 'L') + x(i) + ' ' + y(row.total)).join(' ') + ` L ${x(data.length - 1)} ${H - padB} L ${x(0)} ${H - padB} Z`}
        fill="#6e6bd4" opacity={0.08}
      />

      {pathFor('total', '#6e6bd4')}
      {pathFor('tp',    '#2bbd7a')}
      {pathFor('fp',    '#ef5b6b')}

      {data.map((d, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(d.total)} r={3.5} fill="#6e6bd4" />
          <circle cx={x(i)} cy={y(d.tp)}    r={3.5} fill="#2bbd7a" />
          <circle cx={x(i)} cy={y(d.fp)}    r={3.5} fill="#ef5b6b" />
        </g>
      ))}

      {data.map((d, i) => (
        <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontFamily="Manrope" fontWeight="600" fontSize="10" fill="var(--ink-3)">
          {d.d}
        </text>
      ))}
    </svg>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ink-2)', fontWeight: 600 }}>
      <span style={{ width: 14, height: 3, borderRadius: 2, background: color }} />
      {label}
    </span>
  );
}

export default function BenchmarksView({ payload }: { payload: BenchmarkPayload }) {
  const { rows: benchmark, dataset, citation } = payload;
  const [period, setPeriod] = useState('7d');

  const kpis = useMemo<KpiCard[]>(() => {
    return KPI_DEFS.map(def => ({
      k:   def.label,
      row: benchmark.find(r => r.metric === def.metric) ?? null,
    }));
  }, [benchmark]);

  const reductionRow = benchmark.find(r => r.metric === 'Alert Reduction');

  return (
    <>
      <Topbar
        title="Benchmark Metrics"
        subtitle="System performance against IBM HI-Small · NeurIPS 2023 baseline."
        breadcrumbs={[{ label: 'Home', href: '/alerts' }, { label: 'Benchmarks' }]}
      >
        <div style={{ display: 'flex', gap: 4, background: '#f1f3fa', borderRadius: 9, padding: 3 }}>
          {['7d', '30d', 'All', 'Custom'].map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                background: period === p ? '#fff' : 'transparent',
                color: period === p ? 'var(--ink)' : 'var(--ink-3)',
                boxShadow: period === p ? '0 1px 2px rgba(0,0,0,.06)' : 'none',
                border: 0, padding: '8px 14px', borderRadius: 7, cursor: 'pointer',
                font: "700 11px/1 'Manrope'", letterSpacing: '.12em', textTransform: 'uppercase',
              }}
            >
              Last {p}
            </button>
          ))}
        </div>
        <button className="btn btn--ghost"><Icon name="export" size={14} /> Download CSV</button>
      </Topbar>

      <div className="page__body">
        <div className="bench">
          <div className="alert-banner" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
            {kpis.map(k => {
              const value  = k.row?.aegisStr ?? '—';
              const delta  = k.row?.delta    ?? '—';
              const better = k.row?.aegisBetter ?? null;
              return (
                <div key={k.k} className={'alert-stat' + (better === false ? ' alert-stat--red' : '')}>
                  <span className="alert-stat__lbl">{k.k}</span>
                  <span className="alert-stat__val">{value}</span>
                  <span className={'alert-stat__delta' + (better === false ? ' is-down' : '')}>
                    {delta === '—' ? '—' : `${delta} vs rule`}
                  </span>
                  <SparkPlaceholder better={better} />
                </div>
              );
            })}
          </div>

          <div className="bench-grid">
            <div className="bench-card">
              <h3>
                Rule engine vs AEGIS
                <span className="helper">live · {benchmark.length} metrics</span>
              </h3>
              <table className="cmp-table">
                <thead>
                  <tr><th>Metric</th><th>Rule baseline</th><th>AEGIS</th><th>Δ</th></tr>
                </thead>
                <tbody>
                  {benchmark.map(r => (
                    <tr key={r.metric}>
                      <td>{r.metric}</td>
                      <td className={r.aegisBetter === true ? 'is-bad' : ''}>{r.ruleStr}</td>
                      <td className={r.aegisBetter === true ? 'is-good' : r.aegisBetter === false ? 'is-bad' : ''}>{r.aegisStr}</td>
                      <td>{r.delta !== '—' && <span className="delta">{r.delta}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bench-card">
              <h3>
                Confusion matrix
                <span className="helper">awaiting /api/v1/metrics/confusion</span>
              </h3>
              <div className="cm-matrix">
                <div /><div className="h">Predicted positive</div><div className="h">Predicted negative</div>
                <div className="lbl">Actual positive</div>
                <div className="cell tp">— <small>True positive</small></div>
                <div className="cell fn">— <small>False negative</small></div>

                <div className="lbl">Actual negative</div>
                <div className="cell fp">— <small>False positive</small></div>
                <div className="cell tn">— <small>True negative</small></div>
              </div>
              <div style={{
                marginTop: 16, padding: 12, background: '#fafbff', borderRadius: 10,
                font: "600 12px/1.5 'Manrope'", color: 'var(--ink-2)',
              }}>
                Confusion-matrix counts will appear once the backend exposes per-window TP/FN/FP/TN totals.
              </div>
            </div>
          </div>

          <div className="bench-grid" style={{ gridTemplateColumns: '1.5fr 1fr' }}>
            <div className="bench-card">
              <h3>
                Alert volume over time
                <span className="helper">awaiting /api/v1/metrics/alert-volume</span>
              </h3>
              <AlertVolumeChart data={[]} />
              <div style={{ display: 'flex', gap: 18, marginTop: 12, justifyContent: 'center' }}>
                <Legend color="#6e6bd4" label="Total alerts" />
                <Legend color="#2bbd7a" label="True positive" />
                <Legend color="#ef5b6b" label="False positive" />
              </div>
            </div>

            <div className="bench-card">
              <h3>Alert reduction ratio</h3>
              <div className="reduction">
                <span className="n">{reductionRow?.aegisNum != null ? reductionRow.aegisNum.toFixed(1) : '—'}</span>
                <span className="x">×</span>
                <span className="lbl">fewer false positives vs. rule engine baseline</span>
              </div>
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px dashed var(--line)' }}>
                  <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>Rule baseline · daily FP</span>
                  <span style={{ font: "700 14px/1 'Space Grotesk'", color: 'var(--ink-3)' }}>—</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px dashed var(--line)' }}>
                  <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>AEGIS · daily FP</span>
                  <span style={{ font: "700 14px/1 'Space Grotesk'", color: 'var(--ink-3)' }}>—</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                  <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>Investigator-hours saved · weekly</span>
                  <span style={{ font: "700 14px/1 'Space Grotesk'", color: 'var(--ink-3)' }}>—</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bench-card" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
            <div>
              <div style={{ font: "700 10px/1 'Manrope'", letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 8 }}>
                Dataset provenance
              </div>
              <div className="provenance">
                {dataset ?? '—'}<br />
                {citation ?? '—'}
              </div>
            </div>
            <div>
              <div style={{ font: "700 10px/1 'Manrope'", letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 8 }}>
                Model lineage
              </div>
              <div className="provenance">
                Awaiting /api/v1/metrics/model-lineage
              </div>
            </div>
            <div>
              <div style={{ font: "700 10px/1 'Manrope'", letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 8 }}>
                Audit access
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.55 }}>
                Full notebook output and feature attribution log are available to admin role only.
              </div>
              <button className="btn btn--ghost btn--sm" style={{ marginTop: 10 }}>
                Open benchmark notebook →
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
