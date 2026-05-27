'use client';

import { useState } from 'react';
import { Topbar } from '@/components/nav/Topbar';
import { Icon } from '@/components/shared/Icon';
import type { BenchmarkRow } from '@/lib/metrics';

interface Kpi { k: string; v: string; delta: string; good: boolean; spark: number[]; invert?: boolean }

const KPIS: Kpi[] = [
  { k: 'ROC-AUC',        v: '0.942', delta: '+0.018 vs rule', good: true, spark: [0.91, 0.92, 0.92, 0.93, 0.94, 0.94, 0.942] },
  { k: 'Precision',      v: '0.873', delta: '+0.142 vs rule', good: true, spark: [0.73, 0.75, 0.78, 0.80, 0.83, 0.86, 0.873] },
  { k: 'Recall',         v: '0.812', delta: '+0.094 vs rule', good: true, spark: [0.71, 0.74, 0.77, 0.78, 0.79, 0.80, 0.812] },
  { k: 'F1 Score',       v: '0.841', delta: '+0.119 vs rule', good: true, spark: [0.72, 0.74, 0.77, 0.79, 0.81, 0.83, 0.841] },
  { k: 'False Pos Rate', v: '0.041', delta: '−0.330 vs rule', good: true, spark: [0.39, 0.32, 0.21, 0.14, 0.09, 0.06, 0.041], invert: true },
];

interface VolumeRow { d: string; total: number; tp: number; fp: number }
const ALERT_VOLUME: VolumeRow[] = [
  { d: 'Day 1', total: 1240, tp: 76, fp: 1164 },
  { d: 'Day 2', total: 1180, tp: 82, fp: 1098 },
  { d: 'Day 3', total: 980,  tp: 89, fp: 891 },
  { d: 'Day 4', total: 720,  tp: 93, fp: 627 },
  { d: 'Day 5', total: 410,  tp: 95, fp: 315 },
  { d: 'Day 6', total: 240,  tp: 96, fp: 144 },
  { d: 'Day 7', total: 132,  tp: 96, fp: 36  },
];

function Spark({ data, invert }: { data: number[]; invert?: boolean }) {
  const W = 200, H = 40;
  const min = Math.min(...data), max = Math.max(...data);
  const x = (i: number) => (i / (data.length - 1)) * W;
  const y = (v: number) => H - 4 - ((v - min) / (max - min || 1)) * (H - 8);
  const d = data.map((v, i) => (i === 0 ? 'M' : 'L') + x(i) + ' ' + y(v)).join(' ');
  const last = data[data.length - 1];
  const trendUp = data[data.length - 1] > data[0];
  const color = invert ? (trendUp ? 'var(--danger)' : 'var(--approved)') : (trendUp ? 'var(--approved)' : 'var(--danger)');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="40" className="spark" preserveAspectRatio="none">
      <path d={d + ` L ${W} ${H} L 0 ${H} Z`} fill={color} opacity={0.12} />
      <path d={d} fill="none" stroke={color} strokeWidth="2" />
      <circle cx={x(data.length - 1)} cy={y(last)} r={3} fill={color} />
    </svg>
  );
}

function AlertVolumeChart({ data }: { data: VolumeRow[] }) {
  const W = 640, H = 220;
  const padL = 40, padR = 8, padT = 12, padB = 28;
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

export default function BenchmarksView({ benchmark }: { benchmark: BenchmarkRow[] }) {
  const [period, setPeriod] = useState('7d');

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
          <div className="bench-kpis">
            {KPIS.map(k => (
              <div key={k.k} className={'bench-kpi ' + (k.invert && !k.good ? 'is-bad' : '')}>
                <div className="k">{k.k}</div>
                <div className="v">{k.v}</div>
                <div className="trend" style={{ color: k.invert ? (k.good ? 'var(--approved)' : 'var(--danger)') : 'var(--approved)' }}>
                  {k.delta}
                </div>
                <Spark data={k.spark} invert={k.invert} />
              </div>
            ))}
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
                <span className="helper">eval period · {period}</span>
              </h3>
              <div className="cm-matrix">
                <div /><div className="h">Predicted positive</div><div className="h">Predicted negative</div>
                <div className="lbl">Actual positive</div>
                <div className="cell tp">486 <small>True positive</small></div>
                <div className="cell fn">113 <small>False negative</small></div>

                <div className="lbl">Actual negative</div>
                <div className="cell fp">71 <small>False positive</small></div>
                <div className="cell tn">4 401 330 <small>True negative</small></div>
              </div>
              <div style={{
                marginTop: 16, padding: 12, background: '#fafbff', borderRadius: 10,
                font: "600 12px/1.5 'Manrope'", color: 'var(--ink-2)',
              }}>
                Of the 599 true fraud cases in the evaluation window, AEGIS caught 486 (81.1%) while flagging only 71 false positives — a precision of 87.3% on a 0.1% prevalence dataset.
              </div>
            </div>
          </div>

          <div className="bench-grid" style={{ gridTemplateColumns: '1.5fr 1fr' }}>
            <div className="bench-card">
              <h3>
                Alert volume over time
                <span className="helper">total · true-positive · false-positive</span>
              </h3>
              <AlertVolumeChart data={ALERT_VOLUME} />
              <div style={{ display: 'flex', gap: 18, marginTop: 12, justifyContent: 'center' }}>
                <Legend color="#6e6bd4" label="Total alerts" />
                <Legend color="#2bbd7a" label="True positive" />
                <Legend color="#ef5b6b" label="False positive" />
              </div>
            </div>

            <div className="bench-card">
              <h3>Alert reduction ratio</h3>
              <div className="reduction">
                <span className="n">9.4</span>
                <span className="x">×</span>
                <span className="lbl">fewer false positives vs. rule engine baseline</span>
              </div>
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px dashed var(--line)' }}>
                  <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>Rule baseline · daily FP</span>
                  <span style={{ font: "700 14px/1 'Space Grotesk'", color: 'var(--danger)' }}>1 164</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px dashed var(--line)' }}>
                  <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>AEGIS · daily FP</span>
                  <span style={{ font: "700 14px/1 'Space Grotesk'", color: 'var(--approved)' }}>124</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                  <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>Investigator-hours saved · weekly</span>
                  <span style={{ font: "700 14px/1 'Space Grotesk'", color: 'var(--ink)' }}>312 h</span>
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
                IBM_HI-Small · NeurIPS 2023<br />
                5,078,345 transactions<br />
                0.103% fraud prevalence<br />
                sha256 0x9c7a…f041
              </div>
            </div>
            <div>
              <div style={{ font: "700 10px/1 'Manrope'", letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 8 }}>
                Model lineage
              </div>
              <div className="provenance">
                XGBoost + GAT-Risk · v 2.4.1<br />
                Trained 12 May 2026<br />
                Next retrain · 09 Jun 2026<br />
                Drift · 0.034 (within tol)
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
