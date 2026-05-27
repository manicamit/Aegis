'use client';

import Link from 'next/link';
import { Fragment, useState } from 'react';
import { Topbar } from '@/components/nav/Topbar';
import { Icon } from '@/components/shared/Icon';

type Urgency = 'red' | 'amber' | 'green';

interface HistoryStep {
  role: string;
  ts: string;
  pill: string;
  done?: boolean;
  current?: boolean;
}

interface QueueRow {
  id: string;
  sla: string;
  urg: Urgency;
  account: string;
  bank: string;
  score: number;
  tags: string[];
  assigned: string;
  assignedName: string;
  since: string;
  escStatus: string;
  escLabel: string;
  reason: string;
  history: HistoryStep[];
}

const QUEUE: QueueRow[] = [
  { id: 'AGS-2027H', sla: '1h 48m',  urg: 'red',   account: 'XXXX-XX-9126', bank: 'Yes Bank · Mumbai',    score: 94, tags: ['Structuring', 'Fan-In Fan-Out'],  assigned: 'AS', assignedName: 'Agent Smith',         since: '16 h ago', escStatus: 's-admin', escLabel: 'Awaiting admin', reason: 'Geo-IP mismatch + mule cluster S-19. Investigator requests sign-off before STR submission.',                       history: [{ role: 'Opened', ts: 'May 24 17:00', pill: 'new', done: true }, { role: 'Claimed', ts: 'May 24 17:12', pill: 'in-review', done: true }, { role: 'Escalated', ts: 'May 24 20:40', pill: 'escalated', done: true }, { role: 'Admin review', ts: '—', pill: 'pending', current: true }, { role: 'Resolve', ts: '—', pill: 'close/file', done: false }] },
  { id: 'AGS-2028A', sla: '2h 55m',  urg: 'red',   account: 'XXXX-XX-7741', bank: 'HDFC · Pune',          score: 88, tags: ['Dormant Activation', 'Cross-border'], assigned: 'PR', assignedName: 'Priya Ranganathan', since: '14 h ago', escStatus: 's-admin', escLabel: 'Awaiting admin', reason: 'Dormancy 312 days then ₹6.1L moved in 8h. Counterparty flagged by Interpol notice.',                              history: [{ role: 'Opened', ts: 'May 24 19:05', pill: 'new', done: true }, { role: 'Claimed', ts: 'May 24 19:20', pill: 'in-review', done: true }, { role: 'Escalated', ts: 'May 25 07:10', pill: 'escalated', done: true }, { role: 'Admin review', ts: '—', pill: 'pending', current: true }, { role: 'Resolve', ts: '—', pill: 'close/file', done: false }] },
  { id: 'AGS-2026F', sla: '5h 10m',  urg: 'amber', account: 'XXXX-XX-3381', bank: 'SBI · Delhi',          score: 81, tags: ['Layering', 'PageRank centrality'],   assigned: 'NP', assignedName: 'Nisha Patel',         since: '10 h ago', escStatus: 's-once',  escLabel: 'Escalated once', reason: 'Hub node in mule cluster with 7 flagged neighbours. PageRank top-0.2%.',                                            history: [{ role: 'Opened', ts: 'May 24 23:00', pill: 'new', done: true }, { role: 'Claimed', ts: 'May 24 23:18', pill: 'in-review', done: true }, { role: 'Escalated', ts: 'May 25 04:52', pill: 'escalated', done: true }, { role: 'Admin review', ts: '—', pill: 'pending', current: true }, { role: 'Resolve', ts: '—', pill: 'close/file', done: false }] },
  { id: 'AGS-2025C', sla: '7h 22m',  urg: 'amber', account: 'XXXX-XX-5512', bank: 'Axis · Bengaluru',     score: 77, tags: ['Circular flow', 'Rapid withdrawal'], assigned: 'VS', assignedName: 'Vikram Sethi',        since: '8 h ago',  escStatus: '',         escLabel: 'In review',       reason: 'Circular transaction loop detected across 5 accounts. Analyst escalated for second opinion.',                       history: [{ role: 'Opened', ts: 'May 25 01:30', pill: 'new', done: true }, { role: 'Claimed', ts: 'May 25 02:01', pill: 'in-review', done: true }, { role: 'Escalated', ts: 'May 25 06:15', pill: 'escalated', done: true }, { role: 'Admin review', ts: '—', pill: 'pending', current: true }, { role: 'Resolve', ts: '—', pill: 'close/file', done: false }] },
  { id: 'AGS-2024B', sla: '11h 05m', urg: 'amber', account: 'XXXX-XX-2290', bank: 'ICICI · Chennai',      score: 74, tags: ['Smurfing', 'Sub-threshold'],         assigned: 'AS', assignedName: 'Agent Smith',         since: '5 h ago',  escStatus: '',         escLabel: 'In review',       reason: '14 sub-threshold credits in 3h, mean ₹42k. Pattern consistent with smurfing.',                                       history: [{ role: 'Opened', ts: 'May 25 04:00', pill: 'new', done: true }, { role: 'Claimed', ts: 'May 25 04:25', pill: 'in-review', done: true }, { role: 'Escalated', ts: 'May 25 08:10', pill: 'escalated', done: true }, { role: 'Admin review', ts: '—', pill: 'pending', current: true }, { role: 'Resolve', ts: '—', pill: 'close/file', done: false }] },
  { id: 'AGS-2023K', sla: '18h 30m', urg: 'green', account: 'XXXX-XX-8804', bank: 'Kotak · Mumbai',       score: 69, tags: ['Device sharing', 'Identity link'],    assigned: 'PR', assignedName: 'Priya Ranganathan', since: '2 h ago',  escStatus: '',         escLabel: 'In review',       reason: 'Shared device fingerprint with 3 previously closed mule accounts.',                                                 history: [{ role: 'Opened', ts: 'May 25 07:00', pill: 'new', done: true }, { role: 'Claimed', ts: 'May 25 07:14', pill: 'in-review', done: true }, { role: 'Escalated', ts: 'May 25 09:05', pill: 'escalated', done: true }, { role: 'Admin review', ts: '—', pill: 'pending', current: true }, { role: 'Resolve', ts: '—', pill: 'close/file', done: false }] },
  { id: 'AGS-2022G', sla: '22h 15m', urg: 'green', account: 'XXXX-XX-0117', bank: 'PNB · Kolkata',        score: 65, tags: ['Dormant Activation'],                  assigned: 'NP', assignedName: 'Nisha Patel',         since: '1 h ago',  escStatus: '',         escLabel: 'In review',       reason: 'Account dormant 480 days, single large debit to overseas UPI handle.',                                              history: [{ role: 'Opened', ts: 'May 25 08:00', pill: 'new', done: true }, { role: 'Claimed', ts: 'May 25 08:22', pill: 'in-review', done: true }, { role: 'Escalated', ts: 'May 25 09:00', pill: 'escalated', done: true }, { role: 'Admin review', ts: '—', pill: 'pending', current: true }, { role: 'Resolve', ts: '—', pill: 'close/file', done: false }] },
];

function Timeline({ steps }: { steps: HistoryStep[] }) {
  return (
    <div className="esc-timeline">
      {steps.map((s, i) => (
        <Fragment key={i}>
          <div className={'esc-step' + (s.done && !s.current ? ' is-done' : s.current ? ' is-current' : '')}>
            <span className="role">{s.role}</span>
            <span className="ts">{s.ts}</span>
            <span className="pill">{s.pill}</span>
          </div>
          {i < steps.length - 1 && <div className="esc-arrow">→</div>}
        </Fragment>
      ))}
    </div>
  );
}

export default function EscalationPage() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [resolved, setResolved] = useState<Record<string, boolean>>({});

  const toggle = (id: string) => setExpanded(expanded === id ? null : id);
  const resolve = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setResolved(r => ({ ...r, [id]: true }));
  };

  const active = QUEUE.filter(r => !resolved[r.id]);
  const redCt = active.filter(r => r.urg === 'red').length;

  return (
    <>
      <Topbar
        title="Escalation Queue"
        subtitle="Cases escalated by investigators awaiting admin sign-off before STR filing."
        breadcrumbs={[{ label: 'Home', href: '/alerts' }, { label: 'Admin' }, { label: 'Escalation Queue' }]}
      >
        <span className="tag is-warn" style={{ fontSize: 10, padding: '4px 10px', borderRadius: 6, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' }}>Admin only</span>
        <button className="btn btn--ghost"><Icon name="export" size={14} /> Export list</button>
      </Topbar>

      <div className="page__body">
        <div className="esc-banner">
          <div className="stat amber">
            <div className="lbl">Pending escalations</div>
            <div className="v">{active.length}</div>
            <div className="sub">Across {new Set(active.map(r => r.assignedName)).size} investigators</div>
          </div>
          <div className="stat red">
            <div className="lbl">SLA breach risk</div>
            <div className="v">{redCt}</div>
            <div className="sub">Under 4 h remaining</div>
          </div>
          <div className="stat brand">
            <div className="lbl">Awaiting admin</div>
            <div className="v">{active.filter(r => r.escStatus === 's-admin').length}</div>
            <div className="sub">Needs sign-off to file</div>
          </div>
          <div className="stat green">
            <div className="lbl">Resolved today</div>
            <div className="v">{Object.keys(resolved).length + 12}</div>
            <div className="sub">12 before session start</div>
          </div>
        </div>

        <div className="esc-table">
          <div className="esc-row is-head">
            <span>SLA remaining</span>
            <span>Case</span>
            <span>Assigned to</span>
            <span>Escalated</span>
            <span>Status</span>
            <span>Risk tags</span>
            <span style={{ textAlign: 'right' }}>Actions</span>
          </div>

          {active.length === 0 && (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <div style={{ color: 'var(--approved)', marginBottom: 8, display: 'block', margin: '0 auto 10px' }}>
                <Icon name="circle-check" size={28} />
              </div>
              <div style={{ font: "700 14px/1 'Manrope'", color: 'var(--ink)' }}>All clear</div>
              <div style={{ font: "500 12px/1.4 'Manrope'", color: 'var(--ink-3)', marginTop: 6 }}>No pending escalations.</div>
            </div>
          )}

          {active.map((r) => (
            <Fragment key={r.id}>
              <div className={'esc-row urg-' + r.urg} onClick={() => toggle(r.id)} style={{ cursor: 'pointer' }}>
                <div className="urgency">
                  <span className="clk">{r.sla}</span>
                  <span
                    className={'tag urg-' + r.urg}
                    style={{
                      fontSize: 9, padding: '3px 6px', borderRadius: 5, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 700,
                      background: r.urg === 'red' ? 'var(--danger-soft)' : r.urg === 'amber' ? 'var(--warn-soft)' : 'var(--approved-soft)',
                      color: r.urg === 'red' ? '#b53848' : r.urg === 'amber' ? '#a96b16' : '#1a7d52',
                    }}
                  >
                    {r.urg === 'red' ? 'Breach risk' : r.urg === 'amber' ? 'Watch' : 'On track'}
                  </span>
                </div>
                <div className="case">
                  <b>{r.id}</b>
                  <span>{r.account} · {r.bank}</span>
                </div>
                <div className="assigned">
                  <span className="av">{r.assigned}</span>
                  {r.assignedName}
                </div>
                <div className="since">{r.since}</div>
                <div>
                  <span className={'esc-status ' + r.escStatus}>{r.escLabel}</span>
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {r.tags.map((t, i) => (
                    <span key={i} style={{
                      fontSize: 10, padding: '3px 7px', borderRadius: 5, background: 'var(--brand-soft)',
                      color: 'var(--brand-2)', fontWeight: 700, letterSpacing: '.06em', whiteSpace: 'nowrap',
                    }}>{t}</span>
                  ))}
                </div>
                <div className="esc-actions" style={{ justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => toggle(r.id)}>{expanded === r.id ? 'Collapse' : 'Review'}</button>
                  <button className="primary" onClick={(e) => resolve(r.id, e)}>Approve &amp; File</button>
                </div>
              </div>

              {expanded === r.id && (
                <div className="esc-expand">
                  <h5>Escalation reason</h5>
                  <p style={{ margin: '0 0 16px', font: "500 13px/1.6 'Manrope'", color: 'var(--ink-2)' }}>
                    <b>Score {r.score}/100</b> · {r.reason}
                  </p>
                  <h5>Case history</h5>
                  <Timeline steps={r.history} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                    <Link href="/workspace" className="btn btn--ghost" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Icon name="case" size={14} /> Open workspace
                    </Link>
                    <Link href="/str" className="btn btn--ghost" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Icon name="flag" size={14} /> View STR draft
                    </Link>
                    <button
                      className="btn btn--ghost"
                      style={{ color: 'var(--danger)', borderColor: 'var(--danger-soft)' }}
                      onClick={(e) => { e.stopPropagation(); setExpanded(null); }}
                    >
                      Reject &amp; Return
                    </button>
                  </div>
                </div>
              )}
            </Fragment>
          ))}
        </div>
      </div>
    </>
  );
}
