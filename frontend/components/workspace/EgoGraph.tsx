'use client';

import { useMemo } from 'react';
import type { HoverNode, HoverEdge } from './GraphPane';
import type { LaidOutEdge, LaidOutNode } from '@/lib/graph-shared';

const TYPE_COLOR: Record<string, string> = {
  account:  '#e76edd',
  upi:      '#22d3ee',
  device:   '#2ad1c3',
  branch:   '#a78bfa',
  ip:       '#fbbf24',
  merchant: '#f08a5d',
};

function riskColor(r: number): string {
  if (r >= 80) return '#ef5b6b';
  if (r >= 60) return '#e9a13b';
  if (r >= 40) return '#fbbf24';
  return '#34d399';
}

interface EgoGraphProps {
  layout: { nodes: LaidOutNode[]; edges: LaidOutEdge[] };
  radius: 1 | 2 | 3;
  onHoverNode: (n: HoverNode | null) => void;
  onHoverEdge: (e: HoverEdge | null) => void;
}

export function EgoGraph({ layout, radius, onHoverNode, onHoverEdge }: EgoGraphProps) {
  const W = 720, H = 520;
  const { nodes, edges } = layout;
  const center = nodes.find(n => n.isCenter) ?? nodes[0];

  // Radius gate: hop 1 = only edges incident to centre; hop 2/3 = everything we have.
  const visibleEdges = useMemo(() => {
    if (!center || radius >= 2) return edges;
    return edges.filter(e => e.source === center.id || e.target === center.id);
  }, [edges, center, radius]);

  const visibleIds = useMemo(() => {
    const ids = new Set<string>();
    visibleEdges.forEach(e => { ids.add(e.source); ids.add(e.target); });
    if (center) ids.add(center.id);
    return ids;
  }, [visibleEdges, center]);

  const degree = useMemo(() => {
    const d: Record<string, { in: number; out: number }> = {};
    nodes.forEach(n => { d[n.id] = { in: 0, out: 0 }; });
    edges.forEach(e => {
      if (d[e.source]) d[e.source].out++;
      if (d[e.target]) d[e.target].in++;
    });
    return d;
  }, [nodes, edges]);

  if (!center) {
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'rgba(230,235,255,.5)' }}>
        Empty ego network.
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      width="100%"
      height="100%"
      style={{ display: 'block' }}
      onMouseLeave={() => { onHoverEdge(null); onHoverNode(null); }}
    >
      <defs>
        <radialGradient id="haloC" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ef5b6b" stopOpacity=".35" />
          <stop offset="100%" stopColor="#ef5b6b" stopOpacity="0" />
        </radialGradient>
        <filter id="nodeglow"><feGaussianBlur stdDeviation="3" /></filter>
      </defs>

      <circle cx={center.x} cy={center.y} r={140} fill="url(#haloC)" />
      <circle cx={center.x} cy={center.y} r={120} fill="none" stroke="rgba(255,255,255,.04)" />
      <circle cx={center.x} cy={center.y} r={210} fill="none" stroke="rgba(255,255,255,.04)" />

      {visibleEdges.map((e, i) => {
        const A = nodes.find(n => n.id === e.source);
        const B = nodes.find(n => n.id === e.target);
        if (!A || !B) return null;
        const mx = (A.x + B.x) / 2;
        const my = (A.y + B.y) / 2 - 12;
        const w = Math.max(1.4, Math.min(7, e.amount / 35000));
        const handleEnter = (ev: React.MouseEvent<SVGPathElement>) => {
          const svg = ev.currentTarget.closest('svg');
          if (!svg) return;
          const r = svg.getBoundingClientRect();
          onHoverEdge({
            x: (mx / W) * r.width,
            y: (my / H) * r.height,
            amount: e.amount,
            label: e.label ?? '',
          });
        };
        return (
          <g key={i}>
            <path
              d={`M${A.x} ${A.y} Q ${mx} ${my} ${B.x} ${B.y}`}
              stroke="rgba(110,107,212,.55)"
              strokeWidth={w}
              fill="none"
              strokeLinecap="round"
              opacity={0.75}
              onMouseEnter={handleEnter}
              onMouseLeave={() => onHoverEdge(null)}
            />
            <path
              d={`M${A.x} ${A.y} Q ${mx} ${my} ${B.x} ${B.y}`}
              stroke="transparent"
              strokeWidth={Math.max(10, w + 8)}
              fill="none"
              onMouseEnter={handleEnter}
            />
          </g>
        );
      })}

      {nodes.filter(n => visibleIds.has(n.id)).map(n => {
        const tColor = TYPE_COLOR[n.type] || '#a78bfa';
        const ring = riskColor(n.risk);
        return (
          <g
            key={n.id}
            onMouseEnter={(ev) => {
              const svg = ev.currentTarget.closest('svg');
              if (!svg) return;
              const r = svg.getBoundingClientRect();
              onHoverNode({
                label: n.label,
                type:  n.type,
                risk:  n.risk,
                sub:   n.sub,
                in:    degree[n.id]?.in  ?? 0,
                out:   degree[n.id]?.out ?? 0,
                x: (n.x / W) * r.width,
                y: (n.y / H) * r.height,
              });
            }}
            onMouseLeave={() => onHoverNode(null)}
            style={{ cursor: 'pointer' }}
          >
            <circle cx={n.x} cy={n.y} r={n.r + 8} fill={ring} opacity=".18" filter="url(#nodeglow)" />
            <circle cx={n.x} cy={n.y} r={n.r + 3} fill="none" stroke={ring} strokeWidth={n.isCenter ? 3 : 1.5} opacity={n.isCenter ? 1 : 0.8} />
            <circle cx={n.x} cy={n.y} r={n.r} fill={tColor} />
            <circle cx={n.x} cy={n.y} r={n.r - 4} fill="#0a0c25" opacity=".22" />
            {n.isCenter && (
              <text x={n.x} y={n.y + 4} fontFamily="'Space Grotesk'" fontWeight="800" fontSize="13" fill="#fff" textAnchor="middle">{n.risk}</text>
            )}
            <text x={n.x} y={n.y + n.r + 14} fontFamily="Manrope" fontWeight="700" fontSize="11" textAnchor="middle" fill="rgba(230,235,255,.92)">
              {n.label}
            </text>
            {n.sub && (
              <text x={n.x} y={n.y + n.r + 26} fontFamily="'JetBrains Mono'" fontWeight="500" fontSize="9.5" textAnchor="middle" fill="rgba(230,235,255,.42)">
                {n.sub}
              </text>
            )}
          </g>
        );
      })}

      <g>
        <rect x={14} y={14} rx={8} ry={8} width={240} height={28} fill="rgba(15,18,40,.55)" stroke="rgba(255,255,255,.08)" />
        <circle cx={28} cy={28} r={4} fill="#2ad1c3" />
        <text x={40} y={32} fontFamily="Manrope" fontWeight="700" fontSize="10.5" letterSpacing=".18em" fill="rgba(230,235,255,.85)">
          LIVE · {nodes.filter(n => visibleIds.has(n.id)).length} NODES · {visibleEdges.length} EDGES
        </text>
      </g>
    </svg>
  );
}
