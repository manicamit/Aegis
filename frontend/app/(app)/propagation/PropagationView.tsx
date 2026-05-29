'use client';

import { useMemo, useState } from 'react';
import type { ApiPropagationResponse } from '@/lib/graph-shared';
import { shortLabel } from '@/lib/graph-shared';

interface PropagationViewProps {
  seed:        string;
  propagation: ApiPropagationResponse;
  alpha:       number;
}

interface LaidOutAccount {
  account:    string;
  label:      string;
  intensity:  number;  // 0..100
  raw:        number;  // raw pagerank score
  x:          number;
  y:          number;
  r:          number;
  ring:       number;  // 1, 2, or 3 — only for ring-layout positioning
}

function colorForIntensity(p: number): string {
  if (p >= 80) return '#ef5b6b';
  if (p >= 50) return '#f47e6f';
  if (p >= 30) return '#f08a5d';
  if (p >= 15) return '#e9a13b';
  return '#fbbf24';
}

const W = 720, H = 540;
const SEED_X = W / 2;
const SEED_Y = H / 2;
const RINGS = [120, 200, 270];

function layoutPropagation(prop: ApiPropagationResponse, seedId: string): LaidOutAccount[] {
  const seedFull = seedId.startsWith('ACC_') ? seedId : `ACC_${seedId}`;
  // Exclude the seed itself if it appears at the top
  const others = prop.top_risks.filter(r => r.account !== seedFull && r.account !== seedId);
  if (others.length === 0) return [];

  const maxScore = Math.max(...others.map(r => r.risk_score));

  // Distribute first 8 onto inner ring, next 14 onto mid, rest onto outer
  return others.slice(0, 30).map((r, i) => {
    let ring: 1 | 2 | 3;
    let idxInRing: number;
    let ringCount: number;
    if (i < 8) {
      ring = 1; idxInRing = i; ringCount = Math.min(8, others.length);
    } else if (i < 22) {
      ring = 2; idxInRing = i - 8; ringCount = Math.min(14, others.length - 8);
    } else {
      ring = 3; idxInRing = i - 22; ringCount = Math.min(8, others.length - 22);
    }
    const angle = (idxInRing / Math.max(1, ringCount)) * Math.PI * 2 - Math.PI / 2;
    const radius = RINGS[ring - 1];
    const intensity = Math.round((r.risk_score / maxScore) * 100);

    return {
      account:   r.account,
      label:     shortLabel(r.account),
      intensity,
      raw:       r.risk_score,
      x:         SEED_X + Math.cos(angle) * radius,
      y:         SEED_Y + Math.sin(angle) * radius,
      r:         ring === 1 ? 11 : ring === 2 ? 9 : 8,
      ring,
    };
  });
}

export function PropagationView({ seed, propagation, alpha }: PropagationViewProps) {
  const [threshold, setThreshold] = useState(15);
  const laidOut = useMemo(() => layoutPropagation(propagation, seed), [propagation, seed]);
  const aboveThreshold = laidOut.filter(n => n.intensity >= threshold);

  return (
    <div className="prop">
      <div className="prop-canvas">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" width="100%" height="100%" style={{ display: 'block' }}>
          <defs>
            <filter id="pglow"><feGaussianBlur stdDeviation="4" /></filter>
            <radialGradient id="seedHalo" cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor="#ef5b6b" stopOpacity=".45" />
              <stop offset="100%" stopColor="#ef5b6b" stopOpacity="0" />
            </radialGradient>
          </defs>

          <circle cx={SEED_X} cy={SEED_Y} r={160} fill="url(#seedHalo)" />
          {RINGS.map(r => (
            <circle key={r} cx={SEED_X} cy={SEED_Y} r={r} fill="none" stroke="rgba(255,255,255,.05)" />
          ))}

          {laidOut.map((n, i) => (
            <line
              key={`l${i}`}
              x1={SEED_X} y1={SEED_Y} x2={n.x} y2={n.y}
              stroke={n.intensity >= threshold ? 'rgba(239,91,107,.18)' : 'rgba(255,255,255,.04)'}
              strokeWidth={1}
            />
          ))}

          {/* Seed node */}
          <circle cx={SEED_X} cy={SEED_Y} r={20} fill="#ef5b6b" />
          <circle cx={SEED_X} cy={SEED_Y} r={14} fill="#0a0c25" opacity=".25" />
          <text x={SEED_X} y={SEED_Y + 4} fontFamily="'Space Grotesk'" fontWeight="800" fontSize="13" fill="#fff" textAnchor="middle">★</text>
          <text x={SEED_X} y={SEED_Y + 38} fontFamily="Manrope" fontWeight="700" fontSize="11" fill="#fff" textAnchor="middle">{shortLabel(seed)}</text>
          <text x={SEED_X} y={SEED_Y + 50} fontFamily="'JetBrains Mono'" fontWeight="500" fontSize="9" fill="rgba(230,235,255,.55)" textAnchor="middle">seed</text>

          {laidOut.map(n => {
            const visible = n.intensity >= threshold;
            const color = visible ? colorForIntensity(n.intensity) : 'rgba(255,255,255,.18)';
            return (
              <g key={n.account}>
                {visible && (
                  <circle cx={n.x} cy={n.y} r={n.r + 10} fill={color} opacity={n.intensity / 200} filter="url(#pglow)" />
                )}
                <circle cx={n.x} cy={n.y} r={n.r} fill={visible ? color : '#1c2148'} opacity={visible ? 0.95 : 0.6} />
                <circle cx={n.x} cy={n.y} r={n.r - 4} fill="#0a0c25" opacity=".22" />
                <text x={n.x} y={n.y + n.r + 12} fontFamily="Manrope" fontWeight="700" fontSize="10" fill={visible ? '#fff' : 'rgba(230,235,255,.4)'} textAnchor="middle">
                  {n.label}
                </text>
              </g>
            );
          })}

          <text x={16} y={H - 14} fontFamily="'JetBrains Mono'" fontWeight="500" fontSize="10" fill="rgba(230,235,255,.45)" letterSpacing=".04em">
            Personalised PageRank · α = {alpha.toFixed(2)} · {propagation.total_affected} accounts above 10% baseline
          </text>
        </svg>

        <div className="prop-step-pill">
          <span className="lbl">Affected</span>
          <b>{propagation.total_affected}</b>
          <span style={{ color: 'rgba(255,255,255,.45)' }}>·</span>
          <span className="lbl">Above threshold</span>
          <b>{aboveThreshold.length}</b>
        </div>

        <div className="prop-legend">
          <h5>Intensity scale</h5>
          {[100, 75, 50, 30, 15].map(p => (
            <div key={p} className="row">
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="sw" style={{ background: colorForIntensity(p) }} />
                ≥ {p}%
              </span>
              <span className="pct">{p}%</span>
            </div>
          ))}
        </div>
      </div>

      <div className="prop-side">
        <div className="cluster-card" style={{ marginBottom: 14 }}>
          <div className="head">
            <h3>Threshold</h3>
            <span className="tag is-warn">{aboveThreshold.length} above</span>
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
            Filter accounts by normalised PageRank intensity (100% = highest-risk neighbour after propagation).
          </div>
        </div>

        <div className="cluster-card">
          <div className="head">
            <h3>Top affected accounts</h3>
            <span className="tag is-danger">{propagation.total_affected} total</span>
          </div>
          <div className="impl">
            {aboveThreshold.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-4)', fontSize: 12 }}>
                No accounts above threshold.
              </div>
            )}
            {aboveThreshold.map(n => (
              <div key={n.account} className="impl-item">
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
                  <span>{n.account}</span>
                </div>
                <span className="hop-d">r {n.ring}</span>
              </div>
            ))}
          </div>
          <button className="btn btn--ghost btn--sm">+ Add all to case</button>
        </div>
      </div>
    </div>
  );
}
