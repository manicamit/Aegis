'use client';

import type { SankeyColumn } from '@/lib/graph-shared';

interface SankeyLayout {
  source:  SankeyColumn;
  bridges: SankeyColumn;
  cashOut: SankeyColumn;
  total:   number;
}

const W = 720, H = 520;
const COL_X = [80, 360, 640];

export function SankeyView({ layout }: { layout: SankeyLayout }) {
  const { source, bridges, cashOut, total } = layout;
  const sourceItem = source.items[0];

  if (!sourceItem || total === 0 || bridges.items.length === 0) {
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'rgba(230,235,255,.5)', font: "600 12px/1.4 'Manrope'" }}>
        Sankey path is empty for this account.
      </div>
    );
  }

  const bandHeight = 220;
  const topY = H / 2 - bandHeight / 2;

  // Bridge column rectangles, sized proportionally to amount of total
  let bridgeCursor = topY;
  const bridgeRects = bridges.items.map((b, i) => {
    const h = (b.amount / total) * bandHeight;
    const yMid = bridgeCursor + h / 2;
    const yB = bridgeCursor;
    bridgeCursor += h;

    // Cash-out tier: lay out fixed-height pills evenly
    const co = cashOut.items[i] ?? null;
    const h3 = 26;
    const ycB = topY + i * (bandHeight / Math.max(1, cashOut.items.length || 1));

    return { i, label: b.label, v: b.amount, h, yMid, yB, h2: h, ycA: yB, ycB, h3, co };
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" width="100%" height="100%" style={{ display: 'block' }}>
      <defs>
        {bridges.items.map((_, i) => (
          <linearGradient key={i} id={`sk${i}`} x1={COL_X[0]} x2={COL_X[2]} y1="0" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="#e76edd" stopOpacity=".75" />
            <stop offset="50%"  stopColor="#6e6bd4" stopOpacity=".55" />
            <stop offset="100%" stopColor="#2ad1c3" stopOpacity=".75" />
          </linearGradient>
        ))}
      </defs>

      {[source.label, bridges.label, cashOut.label].map((label, i) => (
        <text
          key={i}
          x={COL_X[i]} y={40}
          fontFamily="Manrope" fontWeight="700" fontSize="10" letterSpacing=".22em"
          fill="rgba(230,235,255,.62)" textAnchor="middle"
        >
          {label.toUpperCase()}
        </text>
      ))}

      <rect x={COL_X[0] - 8} y={topY} width={14} height={bandHeight} fill="#e76edd" rx={3} />
      <text x={COL_X[0] - 18} y={H / 2}      fontFamily="Manrope" fontWeight="700" fontSize="12" fill="#fff" textAnchor="end">{sourceItem.label}</text>
      <text x={COL_X[0] - 18} y={H / 2 + 16} fontFamily="'Space Grotesk'" fontWeight="700" fontSize="11" fill="rgba(255,255,255,.55)" textAnchor="end">
        ₹{(total / 100000).toFixed(2)}L · 100%
      </text>

      {bridgeRects.map(({ i, label, v, h, yMid, yB, h2, ycA, ycB, h3, co }) => (
        <g key={i}>
          <path
            d={`M ${COL_X[0] + 8} ${yMid - h / 2} C ${COL_X[1] - 30} ${yMid - h / 2}, ${COL_X[1] - 30} ${yB}, ${COL_X[1] - 8} ${yB} L ${COL_X[1] - 8} ${yB + h2} C ${COL_X[1] - 30} ${yB + h2}, ${COL_X[1] - 30} ${yMid + h / 2}, ${COL_X[0] + 8} ${yMid + h / 2} Z`}
            fill={`url(#sk${i})`} opacity={0.75}
          />
          <rect x={COL_X[1] - 8} y={yB} width={14} height={h2} fill="#6e6bd4" rx={3} opacity={0.85} />
          <text x={COL_X[1] + 14} y={yB + h2 / 2 + 3}  fontFamily="Manrope" fontWeight="600" fontSize="11" fill="rgba(230,235,255,.85)">{label}</text>
          <text x={COL_X[1] + 14} y={yB + h2 / 2 + 18} fontFamily="'Space Grotesk'" fontWeight="700" fontSize="10" fill="rgba(230,235,255,.5)">₹{(v / 1000).toFixed(0)}k</text>

          {co && (
            <>
              <path
                d={`M ${COL_X[1] + 8} ${ycA} C ${COL_X[2] - 30} ${ycA}, ${COL_X[2] - 30} ${ycB}, ${COL_X[2] - 8} ${ycB} L ${COL_X[2] - 8} ${ycB + h3} C ${COL_X[2] - 30} ${ycB + h3}, ${COL_X[2] - 30} ${ycA + h2}, ${COL_X[1] + 8} ${ycA + h2} Z`}
                fill="rgba(42,209,195,.4)"
              />
              <rect x={COL_X[2] - 8} y={ycB} width={14} height={h3} fill="#2ad1c3" rx={3} />
              <text x={COL_X[2] + 18} y={ycB + h3 / 2 + 3} fontFamily="Manrope" fontWeight="600" fontSize="11" fill="rgba(230,235,255,.85)">{co.label}</text>
            </>
          )}
        </g>
      ))}
    </svg>
  );
}
