'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/shared/Icon';
import type { WorkspaceCase } from '@/lib/workspace-data';

interface CaseSidebarProps {
  caseData: WorkspaceCase;
  /** SLA seconds remaining; null if the backend doesn't yet expose it for this case. */
  slaSecondsRemaining?: number | null;
  /** Number of underlying alerts collapsed into this case; null if not available. */
  collapsedAlerts?: number | null;
  /** Risk-classifier confidence (0-1), if available. */
  confidence?: number | null;
}

export function CaseSidebar({
  caseData,
  slaSecondsRemaining = null,
  collapsedAlerts      = null,
  confidence           = null,
}: CaseSidebarProps) {
  const c = caseData;
  const [seconds, setSeconds] = useState<number | null>(slaSecondsRemaining);
  useEffect(() => {
    setSeconds(slaSecondsRemaining);
  }, [slaSecondsRemaining]);
  useEffect(() => {
    if (seconds == null) return;
    const t = setInterval(() => setSeconds(s => (s == null ? null : Math.max(0, s - 1))), 1000);
    return () => clearInterval(t);
  }, [seconds == null]);
  const mm = seconds != null ? String(Math.floor(seconds / 60)).padStart(2, '0') : '--';
  const ss = seconds != null ? String(seconds % 60).padStart(2, '0')             : '--';
  const urgent = seconds != null && seconds < 300;

  const bankParts = c.bank.split(' · ');
  const bankName  = bankParts[0];
  const bankRest  = bankParts.slice(1).join(' · ');

  return (
    <div className="ws__side">
      <div className="panel">
        <div>
          <div className="case-id">{c.id} · {c.masked}</div>
          <h2 className="case-name">{bankName}</h2>
          <div className="case-bank">{bankRest}</div>
        </div>
        <div className="scorebox">
          <div
            className="ring"
            style={{ ['--ring-pct' as string]: c.score, ['--ring-color' as string]: 'var(--danger)' } as React.CSSProperties}
          >
            <i>{c.score}</i>
          </div>
          <div className="meta">
            <div className="k">Risk score</div>
            <div className="v">{confidence != null ? `Confidence · ${confidence.toFixed(2)}` : 'Confidence · —'}</div>
            <span className="priority">Priority · {c.score >= 90 ? 'P1' : c.score >= 75 ? 'P2' : 'P3'}</span>
          </div>
        </div>
      </div>

      <div className="panel">
        <h4>Case context</h4>
        <div className="row-kv"><span className="k">Status</span><span className="v"><span className="status-pill pending" style={{ fontSize: 10, padding: '3px 7px' }}>{c.status}</span></span></div>
        <div className="row-kv"><span className="k">Assigned</span><span className="v">{c.assigned}</span></div>
        <div className="row-kv"><span className="k">Total moved</span><span className="v">₹{(c.totalMoved / 100000).toFixed(2)}L</span></div>
        <div className="row-kv"><span className="k">Transactions</span><span className="v">{c.txCount}</span></div>
        <div className="row-kv"><span className="k">Time window</span><span className="v mono">21 days</span></div>
        <div className="row-kv"><span className="k">Period</span><span className="v mono">{c.dateRange}</span></div>
      </div>

      {collapsedAlerts != null && collapsedAlerts > 0 && (
        <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="agg-banner">
            <span className="n">{collapsedAlerts}</span>
            <div className="copy">
              <b>alerts collapsed</b>
              <span>From rule + GNN voting</span>
            </div>
          </div>
        </div>
      )}

      <div className="panel">
        <h4>Auto-escalation</h4>
        <div className={'timer-pill ' + (urgent ? 'is-urgent' : '')}>
          <div className="clk">{mm}:{ss}</div>
          <div>
            <div className="lbl">
              {seconds == null
                ? 'No SLA available'
                : urgent ? 'Escalating soon' : 'Until escalation'}
            </div>
            <div style={{ font: "500 11px/1.3 'Manrope'", color: urgent ? '#b53848' : '#a96b16', marginTop: 2 }}>
              {seconds == null ? 'awaiting /api/v1/alerts/{id}/sla' : 'Will route to Admin queue'}
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <h4>FATF rules · {c.fatfRules.length}</h4>
        <div className="rule-list">
          {c.fatfRules.map(r => (
            <div
              key={r.code}
              className={'rule ' + (r.tone === 'danger' ? 'is-danger' : 'is-warn')}
              title={r.note}
            >
              <span className="code">{r.code.split('-')[1]}</span>
              <span>{r.title}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <h4>Actions</h4>
        <div className="side-actions">
          <Link href="/str" className="btn btn--brand"><Icon name="flag" size={14} /> Generate STR</Link>
          <button className="btn btn--ghost"><Icon name="chev-u" size={14} /> Escalate to admin</button>
          <button className="btn btn--ghost"><Icon name="export" size={14} /> Export dossier</button>
          <button className="btn btn--ghost"><Icon name="check" size={14} /> Close case</button>
        </div>
      </div>
    </div>
  );
}
