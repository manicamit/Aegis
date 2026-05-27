'use client';

import { useState } from 'react';
import { EgoGraph } from './EgoGraph';
import { SankeyView } from './SankeyView';
import { ReplayPane } from './ReplayPane';
import { TYPE_COLOR, EGO_EDGES, riskColor } from '@/lib/workspace-data';

type GraphMode = 'sankey' | 'ego' | 'replay';

export interface HoverNode {
  label: string;
  type: string;
  risk: number;
  sub: string;
  x: number;
  y: number;
  in: number;
  out: number;
}

export interface HoverEdge {
  amount: number;
  label: string;
  x: number;
  y: number;
}

export function GraphPane() {
  const [mode, setMode]         = useState<GraphMode>('ego');
  const [radius, setRadius]     = useState<1 | 2 | 3>(2);
  const [hoverNode, setHoverNode] = useState<HoverNode | null>(null);
  const [hoverEdge, setHoverEdge] = useState<HoverEdge | null>(null);

  const modes: [GraphMode, string][] = [
    ['sankey', 'Sankey flow'],
    ['ego',    'Ego network'],
    ['replay', 'Replay'],
  ];

  return (
    <div className="ws__graph">
      <div className="gtoolbar">
        <div className="seg">
          {modes.map(([k, l]) => (
            <button key={k} className={mode === k ? 'is-on' : ''} onClick={() => setMode(k)}>{l}</button>
          ))}
        </div>
        {mode === 'ego' && (
          <div className="radius">
            Radius
            {([1, 2, 3] as const).map(r => (
              <button key={r} className={radius === r ? 'is-on' : ''} onClick={() => setRadius(r)}>{r}</button>
            ))}
            <span className="muted" style={{ fontSize: 11, marginLeft: 4 }}>hops</span>
          </div>
        )}
        <span className="spacer" />
        <span className="muted" style={{ font: "600 11px/1 'JetBrains Mono', monospace", letterSpacing: '.06em', color: 'var(--ink-3)' }}>
          {mode === 'sankey' && 'Fund flow · source → bridges → cash-out'}
          {mode === 'ego'    && `Ego radius ${radius} · ${EGO_EDGES.length} edges`}
          {mode === 'replay' && 'Chronological hop animation'}
        </span>
      </div>

      <div className="gcanvas">
        {mode === 'ego'    && <EgoGraph radius={radius} onHoverNode={setHoverNode} onHoverEdge={setHoverEdge} />}
        {mode === 'sankey' && <SankeyView />}
        {mode === 'replay' && <ReplayPane />}

        {hoverNode && (
          <div className="gtip" style={{ left: hoverNode.x + 24, top: hoverNode.y + 14 }}>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>{hoverNode.label}</div>
            <div className="row"><span className="k">Type</span><span className="v" style={{ textTransform: 'capitalize' }}>{hoverNode.type}</span></div>
            <div className="row"><span className="k">Risk</span><span className="v" style={{ color: riskColor(hoverNode.risk) }}>{hoverNode.risk} / 100</span></div>
            <div className="row"><span className="k">In · out</span><span className="v">{hoverNode.in} · {hoverNode.out}</span></div>
            <div className="row"><span className="k">Ref</span><span className="v">{hoverNode.sub}</span></div>
          </div>
        )}
        {hoverEdge && (
          <div className="gtip" style={{ left: hoverEdge.x + 14, top: hoverEdge.y + 14 }}>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>Edge</div>
            <div className="row"><span className="k">Amount</span><span className="v">₹{hoverEdge.amount.toLocaleString('en-IN')}</span></div>
            <div className="row"><span className="k">Detail</span><span className="v">{hoverEdge.label}</span></div>
            <div className="row"><span className="k">Tag</span><span className="v">{hoverEdge.amount > 200000 ? 'Large value' : 'Standard'}</span></div>
          </div>
        )}

        {mode !== 'replay' && (
          <div className="glegend">
            {Object.entries(TYPE_COLOR).map(([k, c]) => (
              <span key={k} className="lg"><span className="sw" style={{ background: c }} />{k}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
