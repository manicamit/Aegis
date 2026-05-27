'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Topbar } from '@/components/nav/Topbar';
import { Icon } from '@/components/shared/Icon';

interface PropNode {
  id: string;
  label: string;
  sub: string;
  level: number;
  x: number;
  y: number;
  r: number;
}

const PROP_NODES: PropNode[] = [
  { id: 'S1', label: 'AGS-2027H',    sub: 'Yes Bank · Mumbai', level: 0, x: 360, y: 280, r: 16 },
  { id: 'S2', label: 'Cluster S-19', sub: '5 linked accts',    level: 0, x: 180, y: 200, r: 14 },
  { id: 'A1', label: 'Acct ·8841',   sub: 'ICICI · Mumbai',    level: 1, x: 270, y: 140, r: 11 },
  { id: 'A2', label: 'Hayao M.',     sub: 'Osaka · ·1234',     level: 1, x: 460, y: 160, r: 11 },
  { id: 'A3', label: 'UPI@swiftpay', sub: 'VPA',               level: 1, x: 240, y: 360, r: 10 },
  { id: 'A4', label: 'Quick Cash',   sub: 'MCC 6010',          level: 1, x: 460, y: 400, r: 11 },
  { id: 'A5', label: 'Acct ·5503',   sub: 'Axis · Pune',       level: 1, x:  90, y: 280, r: 10 },
  { id: 'B1', label: 'Acct ·9082',   sub: 'HDFC · Pune',       level: 2, x: 580, y:  90, r: 10 },
  { id: 'B2', label: 'Acct ·1199',   sub: 'Kotak · Mumbai',    level: 2, x: 130, y: 440, r: 10 },
  { id: 'B3', label: 'Acct ·6620',   sub: 'PNB · Ludhiana',    level: 2, x: 600, y: 460, r: 10 },
  { id: 'B4', label: 'Acct ·3398',   sub: 'SBI · Hyderabad',   level: 2, x: 360, y:  90, r: 10 },
  { id: 'B5', label: 'Acct ·7712',   sub: 'Federal · Kochi',   level: 2, x: 360, y: 470, r: 10 },
  { id: 'B6', label: 'Acct ·0091',   sub: 'Yes Bank · Pune',   level: 2, x:  90, y: 380, r:  9 },
  { id: 'C1', label: 'Acct ·4421',   sub: 'Canara · Belgaum',  level: 3, x: 660, y: 200, r:  9 },
  { id: 'C2', label: 'Acct ·8801',   sub: 'BoB · Surat',       level: 3, x: 660, y: 360, r:  9 },
  { id: 'C3', label: 'Acct ·2210',   sub: 'IndusInd · Mumbai', level: 3, x:  60, y: 130, r:  9 },
  { id: 'C4', label: 'Acct ·5557',   sub: 'Axis · Pune',       level: 3, x: 250, y:  60, r:  9 },
];

const PROP_EDGES: [string, string][] = [
  ['S1', 'A1'], ['S1', 'A2'], ['S1', 'A3'], ['S1', 'A4'], ['S2', 'A5'], ['S2', 'A1'],
  ['A1', 'B4'], ['A2', 'B1'], ['A3', 'B2'], ['A4', 'B3'], ['A5', 'B6'], ['A4', 'B5'],
  ['B1', 'C1'], ['B3', 'C2'], ['A1', 'C3'], ['B4', 'C4'], ['S2', 'B6'],
];

const DECAY = 0.6;
const SEED_INTENSITY = 100;

const intensityForLevel = (l: number) => Math.round(SEED_INTENSITY * Math.pow(DECAY, l));

function colorForIntensity(p: number): string {
  if (p >= 90) return '#ef5b6b';
  if (p >= 50) return '#f47e6f';
  if (p >= 30) return '#f08a5d';
  if (p >= 15) return '#e9a13b';
  return '#fbbf24';
}

export default function PropagationPage() {
  const [step, setStep]           = useState(0);
  const maxStep                   = 4;
  const [playing, setPlaying]     = useState(false);
  const [threshold, setThreshold] = useState(20);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!playing) return;
    timerRef.current = setTimeout(() => {
      setStep(s => Math.min(s + 1, maxStep));
    }, 1400);
    if (step >= maxStep) setPlaying(false);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [playing, step]);

  const implicated = useMemo(() => PROP_NODES
    .filter(n => n.level >= 1 && n.level + 1 <= step)
    .map(n => ({ ...n, intensity: intensityForLevel(n.level) }))
    .filter(n => n.intensity >= threshold),
  [step, threshold]);

  const totalImplicated = implicated.length;
  const newestLevel = step;

  return (
    <>
      <Topbar
        title="Risk Propagation"
        subtitle="BFS spread of risk from confirmed seeds. Intensity decays 40% per hop."
        breadcrumbs={[
          { label: 'Home', href: '/alerts' },
          { label: 'Workspace', href: '/workspace' },
          { label: 'Propagation' },
        ]}
      >
        <Link href="/workspace" className="btn btn--ghost"><Icon name="chev-l" size={14} /> Back</Link>
        <button className="btn btn--ghost"><Icon name="export" size={14} /> Export CSV</button>
        <button
          className="btn btn--brand"
          onClick={() => { if (step >= maxStep) setStep(0); setPlaying(p => !p); }}
        >
          {playing ? 'Pause' : step === 0 ? 'Start propagation' : 'Resume'}
        </button>
      </Topbar>

      <div className="page__body">
        <div className="prop">
          <div className="prop-canvas">
            <PropGraph step={step} threshold={threshold} newestLevel={newestLevel - 1} />

            <div className="prop-step-pill">
              <span className="lbl">Wave</span>
              <b>{step} / {maxStep}</b>
              <span style={{ color: 'rgba(255,255,255,.45)' }}>·</span>
              <span className="lbl">Implicated</span>
              <b>{totalImplicated}</b>
            </div>

            <div className="prop-legend">
              <h5>Decay scale</h5>
              {[0, 1, 2, 3, 4].map(l => {
                const p = intensityForLevel(l);
                return (
                  <div key={l} className="row">
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="sw" style={{ background: colorForIntensity(p) }} />
                      {l === 0 ? 'Confirmed' : `Hop ${l}`}
                    </span>
                    <span className="pct">{p}%</span>
                  </div>
                );
              })}
            </div>

            {step === 0 && (
              <div style={{
                position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
                pointerEvents: 'none',
              }}>
                <div style={{
                  background: 'rgba(15,18,40,.7)', border: '1px solid rgba(255,255,255,.08)',
                  padding: '14px 22px', borderRadius: 14, color: '#fff',
                  font: "700 12px/1.4 'Manrope'", letterSpacing: '.18em', textTransform: 'uppercase',
                }}>
                  2 seeds ready. Start propagation ▶
                </div>
              </div>
            )}
          </div>

          <div className="prop-side">
            <div className="cluster-card" style={{ marginBottom: 14 }}>
              <div className="head">
                <h3>Threshold</h3>
                <span className="tag is-warn">{implicated.length} above</span>
              </div>
              <div className="slider" style={{ ['--p' as string]: `${threshold}%` } as React.CSSProperties}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={threshold}
                  onChange={(e) => setThreshold(+e.target.value)}
                  style={{ ['--p' as string]: `${threshold}%` } as React.CSSProperties}
                />
                <div className="row">
                  <span>Show ≥ <b>{threshold}%</b></span>
                  <span className="val">{threshold}%</span>
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.5 }}>
                Nodes below the threshold are uncoloured. Drag to tune sensitivity — lowering reveals second- and third-degree neighbours.
              </div>
            </div>

            <div className="cluster-card">
              <div className="head">
                <h3>Newly implicated</h3>
                <span className="tag is-danger">{totalImplicated} total</span>
              </div>
              <div className="impl">
                {implicated.length === 0 && (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-4)', fontSize: 12 }}>
                    No nodes implicated yet. Start propagation to reveal first-degree neighbours.
                  </div>
                )}
                {implicated.map(n => (
                  <div key={n.id} className={'impl-item ' + (n.level === newestLevel - 1 ? 'is-new' : '')}>
                    <div
                      className="ring"
                      style={{
                        ['--ring-pct' as string]: n.intensity,
                        ['--ring-color' as string]: colorForIntensity(n.intensity),
                      } as React.CSSProperties}
                    >
                      <i>{n.intensity}</i>
                    </div>
                    <div>
                      <b>{n.label}</b>
                      <span>{n.sub}</span>
                    </div>
                    <span className="hop-d">hop {n.level}</span>
                  </div>
                ))}
              </div>
              <button className="btn btn--ghost btn--sm">+ Add all to case</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

interface PropGraphProps { step: number; threshold: number; newestLevel: number }

function PropGraph({ step, threshold, newestLevel }: PropGraphProps) {
  const W = 720, H = 540;
  const intensityFor = (node: PropNode): number | null => {
    if (node.level + 1 > step) return null;
    return intensityForLevel(node.level);
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" width="100%" height="100%" style={{ display: 'block' }}>
      <defs>
        <filter id="pglow"><feGaussianBlur stdDeviation="4" /></filter>
      </defs>

      {PROP_EDGES.map(([a, b], i) => {
        const A = PROP_NODES.find(n => n.id === a);
        const B = PROP_NODES.find(n => n.id === b);
        if (!A || !B) return null;
        const litA = intensityFor(A) != null;
        const litB = intensityFor(B) != null;
        const isFresh = (litA && B.level === newestLevel) || (litB && A.level === newestLevel);
        return (
          <line
            key={i}
            x1={A.x} y1={A.y} x2={B.x} y2={B.y}
            stroke={isFresh ? 'rgba(239,91,107,.55)' : (litA && litB ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.06)')}
            strokeWidth={isFresh ? 2.2 : 1.4}
            strokeDasharray={litA && litB ? 'none' : '3 4'}
          >
            {isFresh && <animate attributeName="stroke-opacity" values="0;1;.6" dur="800ms" />}
          </line>
        );
      })}

      {PROP_NODES.map(n => {
        const intensity = intensityFor(n);
        const visible = intensity != null && intensity >= threshold;
        const isFresh = intensity != null && n.level === newestLevel;
        const color = visible ? colorForIntensity(intensity!) : 'rgba(255,255,255,.18)';

        return (
          <g key={n.id}>
            {visible && (
              <circle cx={n.x} cy={n.y} r={n.r + 10} fill={color} opacity={(intensity ?? 0) / 200} filter="url(#pglow)" />
            )}
            {isFresh && (
              <circle cx={n.x} cy={n.y} r={n.r + 16} fill="none" stroke={color} strokeWidth="1.5">
                <animate attributeName="r" values={`${n.r + 6};${n.r + 30};${n.r + 6}`} dur="1.6s" repeatCount="2" />
                <animate attributeName="opacity" values=".9;0;.9" dur="1.6s" repeatCount="2" />
              </circle>
            )}
            <circle cx={n.x} cy={n.y} r={n.r} fill={visible ? color : '#1c2148'} opacity={visible ? 0.95 : 0.6} />
            <circle cx={n.x} cy={n.y} r={n.r - 4} fill="#0a0c25" opacity=".22" />
            {n.level === 0 && (
              <text x={n.x} y={n.y + 4} fontFamily="'Space Grotesk'" fontWeight="800" fontSize="11" fill="#fff" textAnchor="middle">★</text>
            )}
            <text x={n.x} y={n.y + n.r + 14} fontFamily="Manrope" fontWeight="700" fontSize="10.5" fill={visible ? '#fff' : 'rgba(230,235,255,.4)'} textAnchor="middle">
              {n.label}
            </text>
            <text x={n.x} y={n.y + n.r + 26} fontFamily="'JetBrains Mono'" fontWeight="500" fontSize="9" fill="rgba(230,235,255,.42)" textAnchor="middle">
              {n.sub}
            </text>
          </g>
        );
      })}

      <text x={16} y={H - 14} fontFamily="'JetBrains Mono'" fontWeight="500" fontSize="10" fill="rgba(230,235,255,.45)" letterSpacing=".04em">
        DECAY 40% / hop · risk(n) = max_seed(s) × {DECAY}^d(n,s) · d = shortest-path hop
      </text>
    </svg>
  );
}
