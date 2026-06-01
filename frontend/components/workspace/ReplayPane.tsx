'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/shared/Icon';
import type { LaidOutNode, ReplayHopLite } from '@/lib/graph-shared';
import { shortLabel } from '@/lib/graph-shared';

const SPEED_MS = 1100;
const W = 720, H = 520;
const BASE_RISK = 42;

const ctrlBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 8,
  background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.12)',
  color: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer', flex: 'none',
};

interface ReplayPaneProps {
  hops: ReplayHopLite[];
  layout: { nodes: LaidOutNode[]; edges: unknown[] } | null;
}

export function ReplayPane({ hops, layout }: ReplayPaneProps) {
  const [idx, setIdx]         = useState(0);
  const [playing, setPlaying] = useState(false);
  const tickRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resolve positions: prefer ego-layout coords; fall back to an evenly-spaced
  // ring around the centre for hops that touch nodes outside the ego subgraph.
  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number; role: 'source' | 'bridge' | 'terminus' }>();
    if (layout) {
      layout.nodes.forEach(n => {
        map.set(n.id, {
          x: n.x,
          y: n.y,
          role: n.isCenter ? 'source' : 'bridge',
        });
      });
    }
    const sourceId = hops[0]?.from;
    const maxHop = hops.reduce((m, h) => Math.max(m, h.hop), 0);

    const missing: string[] = [];
    hops.forEach(h => {
      if (!map.has(h.from)) missing.push(h.from);
      if (!map.has(h.to))   missing.push(h.to);
    });
    const dedupedMissing = Array.from(new Set(missing));
    dedupedMissing.forEach((id, i) => {
      const angle = (i / Math.max(1, dedupedMissing.length)) * Math.PI * 2;
      map.set(id, {
        x: W / 2 + Math.cos(angle) * 240,
        y: H / 2 + Math.sin(angle) * 200,
        role: 'terminus',
      });
    });

    // Re-classify role for terminus nodes (last-hop targets)
    hops.forEach(h => {
      if (h.hop === maxHop) {
        const p = map.get(h.to);
        if (p) map.set(h.to, { ...p, role: 'terminus' });
      }
    });
    if (sourceId && map.has(sourceId)) {
      const p = map.get(sourceId)!;
      map.set(sourceId, { ...p, role: 'source' });
    }
    return map;
  }, [hops, layout]);

  useEffect(() => {
    if (!playing) return;
    tickRef.current = setTimeout(() => {
      setIdx(i => Math.min(i + 1, hops.length));
      if (idx >= hops.length) setPlaying(false);
    }, SPEED_MS);
    return () => { if (tickRef.current) clearTimeout(tickRef.current); };
  }, [playing, idx, hops.length]);
  useEffect(() => { if (idx >= hops.length) setPlaying(false); }, [idx, hops.length]);

  const visibleHops = hops.slice(0, idx);
  const activeHop   = hops[idx - 1] ?? null;
  const lit = useMemo(() => {
    const s = new Set<string>();
    if (hops[0]) s.add(hops[0].from);
    visibleHops.forEach(h => { s.add(h.from); s.add(h.to); });
    return s;
  }, [visibleHops, hops]);

  // Synthetic risk progression: monotonic rise from BASE_RISK toward 95.
  const riskNow = activeHop ? Math.min(95, BASE_RISK + Math.round((idx / hops.length) * 53)) : BASE_RISK;
  const delta = activeHop ? Math.round((riskNow - BASE_RISK) / Math.max(1, idx)) : 0;

  const step = (d: number) => { setPlaying(false); setIdx(i => Math.max(0, Math.min(hops.length, i + d))); };
  const reset = () => { setPlaying(false); setIdx(0); };
  const playPause = () => { if (idx >= hops.length) setIdx(0); setPlaying(p => !p); };

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" width="100%" height="100%" style={{ display: 'block' }}>
        <defs>
          <radialGradient id="haloR2" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#ef5b6b" stopOpacity=".4" />
            <stop offset="100%" stopColor="#ef5b6b" stopOpacity="0" />
          </radialGradient>
          <filter id="rglow2"><feGaussianBlur stdDeviation="4" /></filter>
        </defs>

        {hops[0] && positions.get(hops[0].from) && (
          <circle cx={positions.get(hops[0].from)!.x} cy={positions.get(hops[0].from)!.y} r={150} fill="url(#haloR2)" />
        )}

        {hops.map((h, i) => {
          const A = positions.get(h.from);
          const B = positions.get(h.to);
          if (!A || !B) return null;
          const ghost = i + 1 > visibleHops.length;
          return (
            <line
              key={'g' + i}
              x1={A.x} y1={A.y} x2={B.x} y2={B.y}
              stroke="rgba(255,255,255,.06)"
              strokeWidth={ghost ? 1 : 2}
              strokeDasharray={ghost ? '3 4' : 'none'}
            />
          );
        })}

        {visibleHops.map((h, i) => {
          const A = positions.get(h.from);
          const B = positions.get(h.to);
          if (!A || !B) return null;
          const isActive = activeHop !== null && h.i === activeHop.i;
          return (
            <g key={'e' + i}>
              <line
                x1={A.x} y1={A.y} x2={B.x} y2={B.y}
                stroke={isActive ? '#ef5b6b' : 'rgba(239,91,107,.55)'}
                strokeWidth={isActive ? 3.5 : 2}
                filter={isActive ? 'url(#rglow2)' : ''}
                strokeLinecap="round"
              />
              <text
                x={(A.x + B.x) / 2} y={(A.y + B.y) / 2 - 8}
                fontFamily="'Space Grotesk'" fontWeight="700" fontSize="10"
                fill={isActive ? '#fff' : 'rgba(255,255,255,.5)'} textAnchor="middle"
              >
                ₹{(h.amount / 1000).toFixed(0)}k
              </text>
              {isActive && (
                <circle r={6}>
                  <animateMotion dur="1.4s" repeatCount="indefinite" path={`M${A.x} ${A.y} L ${B.x} ${B.y}`} />
                  <animate attributeName="fill" values="#ef5b6b;#fff;#ef5b6b" dur="1.4s" repeatCount="indefinite" />
                </circle>
              )}
            </g>
          );
        })}

        {Array.from(positions.entries()).map(([id, p]) => {
          const isLit = lit.has(id);
          const isActive = activeHop !== null && (activeHop.from === id || activeHop.to === id);
          const color = p.role === 'source' ? '#ef5b6b' : p.role === 'terminus' ? '#fbbf24' : '#a78bfa';
          const r = p.role === 'source' ? 20 : 14;
          const label = shortLabel(id);
          return (
            <g key={id}>
              <circle cx={p.x} cy={p.y} r={r + 10} fill={color} opacity={isLit ? 0.18 : 0.04} filter="url(#rglow2)" />
              {isActive && (
                <circle cx={p.x} cy={p.y} r={r + 14} fill="none" stroke={color} strokeWidth={1.5}>
                  <animate attributeName="r" values={`${r + 6};${r + 22};${r + 6}`} dur="1.6s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values=".8;0;.8" dur="1.6s" repeatCount="indefinite" />
                </circle>
              )}
              <circle cx={p.x} cy={p.y} r={r} fill={isLit ? color : '#222a55'} opacity={isLit ? 1 : 0.5} />
              <circle cx={p.x} cy={p.y} r={r - 4} fill="#0a0c25" opacity=".25" />
              <text x={p.x} y={p.y + r + 14} fontFamily="Manrope" fontWeight="700" fontSize="11" textAnchor="middle" fill={isLit ? '#fff' : 'rgba(230,235,255,.4)'}>
                {label}
              </text>
              <text x={p.x} y={p.y + r + 26} fontFamily="'JetBrains Mono'" fontWeight="500" fontSize="9.5" textAnchor="middle" fill="rgba(230,235,255,.4)">
                {p.role}
              </text>
            </g>
          );
        })}
      </svg>

      <div style={{
        position: 'absolute', top: 14, right: 14,
        background: 'rgba(15,18,40,.78)', border: '1px solid rgba(255,255,255,.1)',
        borderRadius: 12, padding: '10px 14px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 110,
      }}>
        <span style={{ font: "700 9px/1 'Manrope'", letterSpacing: '.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,.55)' }}>Risk score</span>
        <span style={{
          font: "800 30px/1 'Space Grotesk'", letterSpacing: '-.02em', marginTop: 4,
          background: 'linear-gradient(180deg,#ff6878,#ef5b6b)',
          WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
        }}>{riskNow}</span>
        <span style={{ font: "600 9px/1 'JetBrains Mono'", color: 'rgba(255,255,255,.5)', marginTop: 3 }}>
          {activeHop ? `+${delta} · hop ${activeHop.i}` : `baseline ${BASE_RISK}`}
        </span>
      </div>

      {activeHop && (
        <div style={{
          position: 'absolute', top: 14, left: 14,
          background: 'rgba(15,18,40,.82)', border: '1px solid rgba(255,255,255,.1)',
          borderRadius: 12, padding: '10px 14px', color: '#fff', minWidth: 210,
        }}>
          <div style={{ font: "700 9px/1 'Manrope'", letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,.55)' }}>
            Hop {activeHop.i} of {hops.length}
          </div>
          <div style={{ font: "700 14px/1.1 'Manrope'", margin: '6px 0 6px' }}>₹{activeHop.amount.toLocaleString('en-IN')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 10px', fontSize: 11 }}>
            <span style={{ color: 'rgba(255,255,255,.55)' }}>From</span><span style={{ color: '#fff', fontWeight: 600 }}>{shortLabel(activeHop.from)}</span>
            <span style={{ color: 'rgba(255,255,255,.55)' }}>To</span><span style={{ color: '#fff', fontWeight: 600 }}>{shortLabel(activeHop.to)}</span>
            <span style={{ color: 'rgba(255,255,255,.55)' }}>Hop</span><span style={{ color: '#fff', fontWeight: 600 }}>{activeHop.hop}</span>
          </div>
        </div>
      )}

      {idx === 0 && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
          <div style={{
            background: 'rgba(15,18,40,.7)', border: '1px solid rgba(255,255,255,.08)',
            padding: '12px 18px', borderRadius: 14, color: '#fff',
            font: "700 11px/1.4 'Manrope'", letterSpacing: '.16em', textTransform: 'uppercase',
          }}>
            Press play ▶ to walk the chain
          </div>
        </div>
      )}

      <div style={{
        position: 'absolute', left: 14, right: 14, bottom: 14,
        background: 'rgba(15,18,40,.82)', border: '1px solid rgba(255,255,255,.1)',
        borderRadius: 12, padding: '8px 12px',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <button onClick={reset} title="Reset" style={ctrlBtn}><Icon name="chev-l" size={14} /></button>
        <button onClick={() => step(-1)} title="Step back" style={ctrlBtn}><Icon name="chev-l" size={14} /></button>
        <button
          onClick={playPause}
          title={playing ? 'Pause' : 'Play'}
          style={{ ...ctrlBtn, background: 'var(--brand)', borderColor: 'var(--brand)', color: '#fff' }}
        >
          {playing
            ? <svg width={12} height={12} viewBox="0 0 24 24"><rect x={7} y={5} width={4} height={14} fill="currentColor" /><rect x={13} y={5} width={4} height={14} fill="currentColor" /></svg>
            : <svg width={12} height={12} viewBox="0 0 24 24"><path d="M7 5l12 7-12 7z" fill="currentColor" /></svg>}
        </button>
        <button onClick={() => step(1)} title="Step" style={ctrlBtn}><Icon name="chev-r" size={14} /></button>
        <div style={{ flex: 1, position: 'relative', height: 22, display: 'flex', alignItems: 'center' }}>
          <div style={{ position: 'relative', width: '100%', height: 4, borderRadius: 2, background: 'rgba(255,255,255,.12)' }}>
            <div style={{
              position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 2,
              width: `${(idx / Math.max(1, hops.length)) * 100}%`,
              background: 'linear-gradient(90deg,var(--brand),var(--teal))',
            }} />
          </div>
          {hops.map((h, i) => {
            const pct = ((i + 0.5) / hops.length) * 100;
            const done = (i + 1) <= idx;
            const here = (i + 1) === idx;
            return (
              <div
                key={i}
                onClick={() => { setPlaying(false); setIdx(i + 1); }}
                title={`hop ${h.hop}`}
                style={{
                  position: 'absolute', left: `${pct}%`, top: 2, width: 2, height: 18,
                  transform: 'translateX(-50%)', borderRadius: 1, cursor: 'pointer',
                  background: here ? '#2ad1c3' : done ? 'var(--brand)' : 'rgba(255,255,255,.25)',
                }}
              />
            );
          })}
        </div>
        <span style={{ font: "700 11px/1 'JetBrains Mono'", color: '#fff', whiteSpace: 'nowrap' }}>
          {idx} / {hops.length}
        </span>
      </div>
    </div>
  );
}
