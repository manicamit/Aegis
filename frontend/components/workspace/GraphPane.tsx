'use client';

import { useMemo, useState } from 'react';
import { EgoGraph } from './EgoGraph';
import { SankeyView } from './SankeyView';
import { ReplayPane } from './ReplayPane';
import {
  layoutEgo,
  layoutSankey,
  sankeyToReplay,
  type ApiEgoResponse,
  type ApiSankeyResponse,
} from '@/lib/graph-shared';

type GraphMode = 'sankey' | 'ego' | 'replay';

export interface HoverNode {
  label: string;
  type:  string;
  risk:  number;
  sub:   string;
  x:     number;
  y:     number;
  in:    number;
  out:   number;
}

export interface HoverEdge {
  amount: number;
  label:  string;
  x:      number;
  y:      number;
}

const TYPE_COLOR_LEGEND: Record<string, string> = {
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

interface GraphPaneProps {
  ego:    ApiEgoResponse    | null;
  sankey: ApiSankeyResponse | null;
}

export function GraphPane({ ego, sankey }: GraphPaneProps) {
  const [mode, setMode]           = useState<GraphMode>('ego');
  const [radius, setRadius]       = useState<1 | 2 | 3>(2);
  const [hoverNode, setHoverNode] = useState<HoverNode | null>(null);
  const [hoverEdge, setHoverEdge] = useState<HoverEdge | null>(null);

  const egoLayout    = useMemo(() => ego    ? layoutEgo(ego)         : null, [ego]);
  const sankeyLayout = useMemo(() => sankey ? layoutSankey(sankey)   : null, [sankey]);
  const replayHops   = useMemo(() => sankey ? sankeyToReplay(sankey) : [],   [sankey]);

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
          {mode === 'sankey' && (sankeyLayout ? `Fund flow · ${sankeyLayout.bridges.items.length} bridges · ${sankeyLayout.cashOut.items.length} cash-out` : 'Sankey flow')}
          {mode === 'ego'    && (egoLayout    ? `Ego radius ${radius} · ${egoLayout.edges.length} edges`                                                   : 'Ego network')}
          {mode === 'replay' && (replayHops.length > 0 ? `Hop replay · ${replayHops.length} steps`                                                          : 'Replay')}
        </span>
      </div>

      <div className="gcanvas">
        {mode === 'ego' && (
          egoLayout
            ? <EgoGraph layout={egoLayout} radius={radius} onHoverNode={setHoverNode} onHoverEdge={setHoverEdge} />
            : <EmptyCanvas msg="Ego-network unavailable for this account." />
        )}
        {mode === 'sankey' && (
          sankeyLayout
            ? <SankeyView layout={sankeyLayout} />
            : <EmptyCanvas msg="Sankey flow unavailable for this account." />
        )}
        {mode === 'replay' && (
          replayHops.length > 0
            ? <ReplayPane hops={replayHops} layout={egoLayout} />
            : <EmptyCanvas msg="No transaction hops to replay." />
        )}

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
            {Object.entries(TYPE_COLOR_LEGEND).map(([k, c]) => (
              <span key={k} className="lg"><span className="sw" style={{ background: c }} />{k}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyCanvas({ msg }: { msg: string }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
      color: 'rgba(230,235,255,.5)', font: "600 12px/1.4 'Manrope'",
    }}>
      {msg}
    </div>
  );
}
