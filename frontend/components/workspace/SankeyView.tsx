'use client';

interface SankeyCol {
  label: string;
  items: [string, number][];
}

const COLS: SankeyCol[] = [
  { label: 'Source',   items: [['AGS-2027H', 842000]] },
  { label: 'Bridges',  items: [
    ['ACME Imports',     250000],
    ['Hayao Miyazaki',   180000],
    ['UPI@swiftpay',      92000],
    ['Device 0xA94CF',    60000],
    ['IP 203.0.113.84',   88000],
  ]},
  { label: 'Cash-out', items: [
    ['Mule cluster S-19', 132000],
    ['Acct ·9082',        120000],
    ['Watchlist hit',      90000],
    ['Acct ·1199',         80000],
    ['Cash · MCC 6010',   132000],
  ]},
];

const W = 720, H = 520;
const COL_X = [80, 360, 640];
const TOTAL = 842000;

export function SankeyView() {
  let yA = H / 2 - 110;
  const bridgeRects = COLS[1].items.map(([label, v], i) => {
    const h = (v / TOTAL) * 220;
    const yMid = yA + h / 2;
    yA += h;

    const yB = H / 2 - 110 + COLS[2].items.slice(0, i).reduce((acc, [, v2]) => acc + (v2 / TOTAL) * 220, 0);
    const h2 = (COLS[2].items[i][1] / TOTAL) * 220;
    const ycA = yB;
    const ycB = H / 2 - 100 + i * 38;
    const h3 = 26;

    return { i, label, v, h, yMid, yB, h2, ycA, ycB, h3 };
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" width="100%" height="100%" style={{ display: 'block' }}>
      <defs>
        {COLS[1].items.map((_, i) => (
          <linearGradient key={i} id={`sk${i}`} x1={COL_X[0]} x2={COL_X[2]} y1="0" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="#e76edd" stopOpacity=".75" />
            <stop offset="50%"  stopColor="#6e6bd4" stopOpacity=".55" />
            <stop offset="100%" stopColor="#2ad1c3" stopOpacity=".75" />
          </linearGradient>
        ))}
      </defs>

      {COLS.map((c, i) => (
        <text
          key={i}
          x={COL_X[i]} y={40}
          fontFamily="Manrope" fontWeight="700" fontSize="10" letterSpacing=".22em"
          fill="rgba(230,235,255,.62)" textAnchor="middle"
        >
          {c.label.toUpperCase()}
        </text>
      ))}

      <rect x={COL_X[0] - 8} y={H / 2 - 110} width={14} height={220} fill="#e76edd" rx={3} />
      <text x={COL_X[0] - 18} y={H / 2} fontFamily="Manrope" fontWeight="700" fontSize="12" fill="#fff" textAnchor="end">AGS-2027H</text>
      <text x={COL_X[0] - 18} y={H / 2 + 16} fontFamily="'Space Grotesk'" fontWeight="700" fontSize="11" fill="rgba(255,255,255,.55)" textAnchor="end">₹8.4L · 100%</text>

      {bridgeRects.map(({ i, label, v, h, yMid, yB, h2, ycA, ycB, h3 }) => (
        <g key={i}>
          <path
            d={`M ${COL_X[0] + 8} ${yMid - h / 2} C ${COL_X[1] - 30} ${yMid - h / 2}, ${COL_X[1] - 30} ${yB}, ${COL_X[1] - 8} ${yB} L ${COL_X[1] - 8} ${yB + h2} C ${COL_X[1] - 30} ${yB + h2}, ${COL_X[1] - 30} ${yMid + h / 2}, ${COL_X[0] + 8} ${yMid + h / 2} Z`}
            fill={`url(#sk${i})`} opacity={0.75}
          />
          <rect x={COL_X[1] - 8} y={yB} width={14} height={h2} fill="#6e6bd4" rx={3} opacity={0.85} />
          <text x={COL_X[1] + 14} y={yB + h2 / 2 + 3} fontFamily="Manrope" fontWeight="600" fontSize="11" fill="rgba(230,235,255,.85)">{label}</text>
          <text x={COL_X[1] + 14} y={yB + h2 / 2 + 18} fontFamily="'Space Grotesk'" fontWeight="700" fontSize="10" fill="rgba(230,235,255,.5)">₹{(v / 1000).toFixed(0)}k</text>

          <path
            d={`M ${COL_X[1] + 8} ${ycA} C ${COL_X[2] - 30} ${ycA}, ${COL_X[2] - 30} ${ycB}, ${COL_X[2] - 8} ${ycB} L ${COL_X[2] - 8} ${ycB + h3} C ${COL_X[2] - 30} ${ycB + h3}, ${COL_X[2] - 30} ${ycA + h2}, ${COL_X[1] + 8} ${ycA + h2} Z`}
            fill="rgba(42,209,195,.4)"
          />
          <rect x={COL_X[2] - 8} y={ycB} width={14} height={h3} fill="#2ad1c3" rx={3} />
          <text x={COL_X[2] + 18} y={ycB + h3 / 2 + 3} fontFamily="Manrope" fontWeight="600" fontSize="11" fill="rgba(230,235,255,.85)">{COLS[2].items[i][0]}</text>
        </g>
      ))}
    </svg>
  );
}
