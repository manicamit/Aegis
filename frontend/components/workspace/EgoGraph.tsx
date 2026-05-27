'use client';

import { useMemo } from 'react';
import { EGO_NODES, EGO_EDGES, TYPE_COLOR, riskColor } from '@/lib/workspace-data';
import type { HoverNode, HoverEdge } from './GraphPane';

interface EgoGraphProps {
  radius: 1 | 2 | 3;
  onHoverNode: (n: HoverNode | null) => void;
  onHoverEdge: (e: HoverEdge | null) => void;
}

export function EgoGraph({ radius, onHoverNode, onHoverEdge }: EgoGraphProps) {
  const visibleIds = useMemo(() => {
    if (radius >= 2) return new Set(EGO_NODES.map(n => n.id));
    const ring1 = new Set(EGO_EDGES.filter(e => e.source === 'C').map(e => e.target));
    ring1.add('C');
    return ring1;
  }, [radius]);

  const visibleEdges = useMemo(
    () => EGO_EDGES.filter(e => visibleIds.has(e.source) && visibleIds.has(e.target)),
    [visibleIds],
  );

  const degree = useMemo(() => {
    const d: Record<string, { in: number; out: number }> = {};
    EGO_NODES.forEach(n => { d[n.id] = { in: 0, out: 0 }; });
    EGO_EDGES.forEach(e => { d[e.source].out++; d[e.target].in++; });
    return d;
  }, []);

  const W = 720, H = 520;
  const center = EGO_NODES[0];

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
        const A = EGO_NODES.find(n => n.id === e.source)!;
        const B = EGO_NODES.find(n => n.id === e.target)!;
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

      {EGO_NODES.filter(n => visibleIds.has(n.id)).map(n => {
        const tColor = TYPE_COLOR[n.type] || '#a78bfa';
        const ring = riskColor(n.risk);
        const isCenter = n.id === 'C';
        return (
          <g
            key={n.id}
            onMouseEnter={(ev) => {
              const svg = ev.currentTarget.closest('svg');
              if (!svg) return;
              const r = svg.getBoundingClientRect();
              onHoverNode({
                label: n.label,
                type: n.type,
                risk: n.risk,
                sub: n.sub,
                in: degree[n.id].in,
                out: degree[n.id].out,
                x: (n.x / W) * r.width,
                y: (n.y / H) * r.height,
              });
            }}
            onMouseLeave={() => onHoverNode(null)}
            style={{ cursor: 'pointer' }}
          >
            <circle cx={n.x} cy={n.y} r={n.r + 8} fill={ring} opacity=".18" filter="url(#nodeglow)" />
            <circle cx={n.x} cy={n.y} r={n.r + 3} fill="none" stroke={ring} strokeWidth={isCenter ? 3 : 1.5} opacity={isCenter ? 1 : 0.8} />
            <circle cx={n.x} cy={n.y} r={n.r} fill={tColor} />
            <circle cx={n.x} cy={n.y} r={n.r - 4} fill="#0a0c25" opacity=".22" />
            {isCenter && (
              <text x={n.x} y={n.y + 4} fontFamily="'Space Grotesk'" fontWeight="800" fontSize="13" fill="#fff" textAnchor="middle">94</text>
            )}
            <text x={n.x} y={n.y + n.r + 14} fontFamily="Manrope" fontWeight="700" fontSize="11" textAnchor="middle" fill="rgba(230,235,255,.92)">
              {n.label}
            </text>
            <text x={n.x} y={n.y + n.r + 26} fontFamily="'JetBrains Mono'" fontWeight="500" fontSize="9.5" textAnchor="middle" fill="rgba(230,235,255,.42)">
              {n.sub}
            </text>
          </g>
        );
      })}

      <g>
        <rect x={14} y={14} rx={8} ry={8} width={220} height={28} fill="rgba(15,18,40,.55)" stroke="rgba(255,255,255,.08)" />
        <circle cx={28} cy={28} r={4} fill="#2ad1c3" />
        <text x={40} y={32} fontFamily="Manrope" fontWeight="700" fontSize="10.5" letterSpacing=".18em" fill="rgba(230,235,255,.85)">
          LIVE · {EGO_NODES.filter(n => visibleIds.has(n.id)).length} NODES · {visibleEdges.length} EDGES
        </text>
      </g>
    </svg>
  );
}
