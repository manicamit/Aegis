'use client';

import { Fragment, useState } from 'react';
import { Topbar } from '@/components/nav/Topbar';
import { Icon } from '@/components/shared/Icon';

const EVT_COLOR: Record<string, string> = {
  LOGIN_SUCCESS:        'e-approve',
  LOGIN_FAIL:           'e-freeze',
  STR_GENERATED:        'e-str',
  STR_EXPORTED:         'e-export',
  CASE_STATUS_CHANGED:  '',
  BULK_CLOSE:           'e-flag',
  API_KEY_CREATED:      'e-system',
  API_KEY_REVOKED:      'e-freeze',
  MODEL_RETRAIN_SCHED:  'e-system',
  INVESTIGATION_OPENED: '',
  ALERT_ASSIGNED:       '',
  USER_ROLE_CHANGED:    'e-flag',
  GRAPH_EXPORT:         'e-export',
  SESSION_EXPIRED:      'e-freeze',
};

interface AuditEvent {
  ts: string;
  tm: string;
  evt: string;
  actor: string;
  name: string;
  role: string;
  ref: string;
  desc: string;
  hash: string;
  hashVal: string;
  prev: string;
  broken: boolean;
  payload: string;
}

const LOG: AuditEvent[] = [
  { ts: '2026-05-25', tm: '09:14:08', evt: 'STR_EXPORTED', actor: 'AS', name: 'Agent Smith', role: 'investigator', ref: 'AGS-2027H', desc: 'Case dossier exported as PDF · 248 KB', hash: 'blk#41 209', hashVal: '0x4f3d…e892', prev: '0x9c7a…f041', broken: false, payload: `{\n  "event": "STR_EXPORTED",\n  "case_id": "AGS-2027H",\n  "format": "pdf",\n  "size_kb": 248,\n  "pii_masked": true,\n  "actor": "a.smith@aegis.fiu",\n  "ip": "203.0.113.84",\n  "device_fp": "0xA94CF"\n}` },
  { ts: '2026-05-25', tm: '09:11:33', evt: 'STR_GENERATED', actor: 'AS', name: 'Agent Smith', role: 'investigator', ref: 'AGS-2027H', desc: 'STR narrative generated · claude-3-5 · 1,840 words', hash: 'blk#41 208', hashVal: '0x9c7a…f041', prev: '0x3a1b…2d08', broken: false, payload: `{\n  "event": "STR_GENERATED",\n  "case_id": "AGS-2027H",\n  "model": "claude-3-5-sonnet-20241022",\n  "prompt_version": "4.2",\n  "words": 1840,\n  "pii_masked": true,\n  "latency_ms": 2140\n}` },
  { ts: '2026-05-25', tm: '09:08:01', evt: 'CASE_STATUS_CHANGED', actor: 'AS', name: 'Agent Smith', role: 'investigator', ref: 'AGS-2027H', desc: 'Status changed: new → in-review', hash: 'blk#41 207', hashVal: '0x3a1b…2d08', prev: '0xc88f…9301', broken: false, payload: `{\n  "event": "CASE_STATUS_CHANGED",\n  "case_id": "AGS-2027H",\n  "from": "new",\n  "to": "in-review",\n  "actor": "a.smith@aegis.fiu"\n}` },
  { ts: '2026-05-25', tm: '08:55:21', evt: 'LOGIN_SUCCESS', actor: 'AS', name: 'Agent Smith', role: 'investigator', ref: '—', desc: 'Signed in · ip=203.0.113.84 · device 0xA94CF', hash: 'blk#41 206', hashVal: '0xc88f…9301', prev: '0x71de…ab20', broken: false, payload: `{\n  "event": "LOGIN_SUCCESS",\n  "actor": "a.smith@aegis.fiu",\n  "role": "investigator",\n  "ip": "203.0.113.84",\n  "device_fp": "0xA94CF",\n  "jwt_exp": "2026-05-25T17:55:21Z"\n}` },
  { ts: '2026-05-25', tm: '08:54:48', evt: 'MODEL_RETRAIN_SCHED', actor: 'SY', name: 'System', role: 'system', ref: '—', desc: 'Retrain scheduled · next 2026-06-09T03:00Z · drift 0.034', hash: 'blk#41 205', hashVal: '0x71de…ab20', prev: '0xe2c3…4417', broken: false, payload: `{\n  "event": "MODEL_RETRAIN_SCHED",\n  "actor": "scheduler",\n  "next_run": "2026-06-09T03:00:00Z",\n  "drift_score": 0.034,\n  "threshold": 0.05,\n  "model_version": "v2.4.1"\n}` },
  { ts: '2026-05-25', tm: '08:32:11', evt: 'BULK_CLOSE', actor: 'ML', name: 'Manager Lee', role: 'admin', ref: 'AGS-2027F', desc: '14 alerts bulk-closed · reason: duplicate', hash: 'blk#41 204', hashVal: '0xe2c3…4417', prev: '0x0bf7…3390', broken: false, payload: `{\n  "event": "BULK_CLOSE",\n  "actor": "m.lee@aegis.fiu",\n  "count": 14,\n  "reason": "duplicate_of_AGS-2027F",\n  "alert_ids": ["AGS-2027A","AGS-2027B","...+12 more"]\n}` },
  { ts: '2026-05-25', tm: '08:14:47', evt: 'API_KEY_CREATED', actor: 'ML', name: 'Manager Lee', role: 'admin', ref: '—', desc: "API key created · label 'Sandbox · staging'", hash: 'blk#41 203', hashVal: '0x0bf7…3390', prev: '0x5ad9…81fe', broken: false, payload: `{\n  "event": "API_KEY_CREATED",\n  "actor": "m.lee@aegis.fiu",\n  "key_label": "Sandbox · staging",\n  "scope": "investigations",\n  "key_hash": "ak_91qn…7d80"\n}` },
  { ts: '2026-05-25', tm: '07:40:02', evt: 'INVESTIGATION_OPENED', actor: 'PR', name: 'Priya Ranganathan', role: 'investigator', ref: 'AGS-2028A', desc: 'Case opened for account XXXX-XX-7741 · score 88', hash: 'blk#41 202', hashVal: '0x5ad9…81fe', prev: '0xa91c…dd03', broken: false, payload: `{\n  "event": "INVESTIGATION_OPENED",\n  "case_id": "AGS-2028A",\n  "account_masked": "XXXX-XX-7741",\n  "risk_score": 88,\n  "actor": "p.ranganathan@aegis.fiu"\n}` },
  { ts: '2026-05-25', tm: '07:12:55', evt: 'ALERT_ASSIGNED', actor: 'PR', name: 'Priya Ranganathan', role: 'investigator', ref: 'AGS-2028A', desc: 'Alert claimed by investigator', hash: 'blk#41 201', hashVal: '0xa91c…dd03', prev: '0xf3b8…7c12', broken: false, payload: `{\n  "event": "ALERT_ASSIGNED",\n  "case_id": "AGS-2028A",\n  "assigned_to": "p.ranganathan@aegis.fiu",\n  "prev_assignee": null\n}` },
  { ts: '2026-05-24', tm: '22:01:09', evt: 'LOGIN_FAIL', actor: 'T4', name: 'Test User 042', role: 'investigator', ref: '—', desc: 'Sign-in failed · ip=10.4.21.6 · attempt 3 of 5', hash: 'blk#41 200', hashVal: '0xf3b8…7c12', prev: '0x8d4e…2b90', broken: false, payload: `{\n  "event": "LOGIN_FAIL",\n  "actor": "test042@aegis.fiu",\n  "ip": "10.4.21.6",\n  "reason": "invalid_password",\n  "attempt": 3,\n  "lockout_at": 5\n}` },
  { ts: '2026-05-24', tm: '17:55:30', evt: 'GRAPH_EXPORT', actor: 'VS', name: 'Vikram Sethi', role: 'analyst', ref: 'AGS-2025C', desc: 'Ego network exported as SVG · radius 2', hash: 'blk#41 199', hashVal: '0x8d4e…2b90', prev: '0x2c61…f508', broken: false, payload: `{\n  "event": "GRAPH_EXPORT",\n  "case_id": "AGS-2025C",\n  "format": "svg",\n  "radius": 2,\n  "node_count": 41,\n  "actor": "v.sethi@aegis.fiu"\n}` },
  { ts: '2026-05-24', tm: '14:22:17', evt: 'USER_ROLE_CHANGED', actor: 'ML', name: 'Manager Lee', role: 'admin', ref: '—', desc: 'Vikram Sethi role: investigator → analyst', hash: 'blk#41 198', hashVal: '0x2c61…f508', prev: '0xb19a…3c77', broken: false, payload: `{\n  "event": "USER_ROLE_CHANGED",\n  "actor": "m.lee@aegis.fiu",\n  "target_user": "v.sethi@aegis.fiu",\n  "from_role": "investigator",\n  "to_role": "analyst"\n}` },
  { ts: '2026-05-24', tm: '11:08:43', evt: 'STR_EXPORTED', actor: 'NP', name: 'Nisha Patel', role: 'analyst', ref: 'AGS-2024B', desc: 'Case dossier exported as JSON · 14 KB', hash: 'blk#41 197', hashVal: '0xb19a…3c77', prev: '0x44f2…901e', broken: false, payload: `{\n  "event": "STR_EXPORTED",\n  "case_id": "AGS-2024B",\n  "format": "json",\n  "size_kb": 14,\n  "pii_masked": true,\n  "actor": "n.patel@aegis.fiu"\n}` },
  { ts: '2026-05-23', tm: '16:30:01', evt: 'API_KEY_REVOKED', actor: 'ML', name: 'Manager Lee', role: 'admin', ref: '—', desc: 'API key revoked · hash ak_old9…112c', hash: 'blk#41 196', hashVal: '0x44f2…901e', prev: '0x7e9d…5b23', broken: false, payload: `{\n  "event": "API_KEY_REVOKED",\n  "actor": "m.lee@aegis.fiu",\n  "key_hash": "ak_old9…112c",\n  "reason": "key_rotation"\n}` },
  { ts: '2026-05-23', tm: '09:44:18', evt: 'LOGIN_SUCCESS', actor: 'ML', name: 'Manager Lee', role: 'admin', ref: '—', desc: 'Signed in · ip=203.0.113.5 · MFA verified', hash: 'blk#41 195', hashVal: '0x7e9d…5b23', prev: '0x1f0c…e341', broken: false, payload: `{\n  "event": "LOGIN_SUCCESS",\n  "actor": "m.lee@aegis.fiu",\n  "role": "admin",\n  "ip": "203.0.113.5",\n  "mfa": true,\n  "jwt_exp": "2026-05-23T17:44:18Z"\n}` },
];

const FILTER_TYPES = ['All events', 'LOGIN', 'STR', 'CASE', 'SYSTEM', 'API', 'EXPORT'];

function matchFilter(row: AuditEvent, type: string): boolean {
  if (type === 'All events') return true;
  if (type === 'LOGIN')  return row.evt.startsWith('LOGIN');
  if (type === 'STR')    return row.evt.startsWith('STR');
  if (type === 'CASE')   return row.evt.startsWith('CASE') || row.evt === 'INVESTIGATION_OPENED' || row.evt === 'ALERT_ASSIGNED' || row.evt === 'BULK_CLOSE';
  if (type === 'SYSTEM') return row.evt.startsWith('MODEL') || row.evt === 'SESSION_EXPIRED';
  if (type === 'API')    return row.evt.startsWith('API') || row.evt === 'USER_ROLE_CHANGED';
  if (type === 'EXPORT') return row.evt.includes('EXPORT') || row.evt.includes('GRAPH');
  return true;
}

export default function AuditPage() {
  const [filter, setFilter]     = useState('All events');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [verified, setVerified] = useState<Record<number, boolean>>({});
  const [period, setPeriod]     = useState('Today');

  const rows = LOG.filter(r => {
    if (!matchFilter(r, filter)) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.name.toLowerCase().includes(q) || r.evt.toLowerCase().includes(q) || r.ref.toLowerCase().includes(q) || r.desc.toLowerCase().includes(q);
    }
    return true;
  });

  const toggleExpand = (i: number) => setExpanded(expanded === i ? null : i);
  const verify = (i: number) => setVerified(v => ({ ...v, [i]: true }));

  return (
    <>
      <Topbar
        title="Audit Trail"
        subtitle="Hash-chained, tamper-evident log of every privileged action in AEGIS."
        breadcrumbs={[{ label: 'Home', href: '/alerts' }, { label: 'Admin' }, { label: 'Audit Trail' }]}
      >
        <span className="tag is-warn" style={{ fontSize: 10, padding: '4px 10px', borderRadius: 6, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' }}>Admin only</span>
        <button className="btn btn--ghost"><Icon name="export" size={14} /> Export CSV</button>
      </Topbar>

      <div className="page__body">
        <div className="audit-banner">
          <div className="stat">
            <div className="lbl">Total events</div>
            <div className="v">24,910</div>
            <div className="sub">Since 01 Jan 2026</div>
          </div>
          <div className="stat is-chain">
            <div className="lbl">Chain integrity</div>
            <div className="v">Verified</div>
            <div className="sub">Head blk#41 209 · prev 0x9c7a…f041</div>
          </div>
          <div className="stat">
            <div className="lbl">Anomalies detected</div>
            <div className="v">0</div>
            <div className="sub" style={{ color: 'var(--approved)' }}>No broken links</div>
          </div>
          <div className="stat">
            <div className="lbl">Exports this week</div>
            <div className="v">3</div>
            <div className="sub">2 PDF · 1 JSON</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 220px' }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-4)' }}>
              <Icon name="search" size={15} />
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search actor, event, case ref…"
              style={{
                width: '100%', paddingLeft: 32, paddingRight: 12, height: 36,
                border: '1px solid var(--line-strong)', borderRadius: 9,
                font: "500 13px/1 'Manrope'", outline: 'none',
                background: '#fff',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 4, background: '#f1f3fa', borderRadius: 9, padding: 3 }}>
            {['Today', '7d', '30d', 'All'].map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                style={{
                  background: period === p ? '#fff' : 'transparent',
                  color: period === p ? 'var(--ink)' : 'var(--ink-3)',
                  boxShadow: period === p ? '0 1px 2px rgba(0,0,0,.06)' : 'none',
                  border: 0, padding: '7px 12px', borderRadius: 7, cursor: 'pointer',
                  font: "700 12px/1 'Manrope'",
                }}
              >{p}</button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            {FILTER_TYPES.map(t => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                style={{
                  height: 32, padding: '0 12px', borderRadius: 7, cursor: 'pointer',
                  font: "700 11px/1 'Manrope'", letterSpacing: '.06em',
                  border: filter === t ? '1px solid var(--brand)' : '1px solid var(--line-strong)',
                  background: filter === t ? 'var(--brand-soft)' : '#fff',
                  color: filter === t ? 'var(--brand-2)' : 'var(--ink-3)',
                }}
              >{t}</button>
            ))}
          </div>
        </div>

        <div className="audit-table">
          <div className="audit-row is-head">
            <span>Timestamp</span>
            <span>Event</span>
            <span>Actor</span>
            <span>Case ref</span>
            <span>Description</span>
            <span>Block hash</span>
            <span />
          </div>

          {rows.length === 0 && (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink-4)', font: "600 13px/1 'Manrope'" }}>
              No events match the current filters.
            </div>
          )}

          {rows.map((r, i) => (
            <Fragment key={i}>
              <div className={'audit-row' + (r.broken ? ' is-broken' : '')} onClick={() => toggleExpand(i)}>
                <span className="ts">
                  <b>{r.ts}</b>
                  {r.tm}
                </span>
                <span>
                  <span className={'evt ' + (EVT_COLOR[r.evt] || '')}>{r.evt.replace(/_/g, ' ')}</span>
                </span>
                <span className="role">
                  <span className="av">{r.actor}</span>
                  {r.name}
                </span>
                <span className="ref">{r.ref}</span>
                <span className="desc">{r.desc}</span>
                <span className="hash">
                  <b>{r.hash}</b>
                  <span className="prev">prev {r.prev}</span>
                </span>
                <button className="more" onClick={(e) => { e.stopPropagation(); toggleExpand(i); }}>
                  <Icon name={expanded === i ? 'chev-u' : 'chev-d'} size={14} />
                </button>
              </div>

              {expanded === i && (
                <div className="audit-expand">
                  <div>
                    <h5>Payload</h5>
                    <div className="json">{r.payload}</div>
                  </div>
                  <div>
                    <h5>Chain verification</h5>
                    <div className="chain">
                      <div className="link">
                        <span className="role">This block</span>
                        <span className="h">{r.hashVal}</span>
                      </div>
                      <div className="arrow">↑</div>
                      <div className="link">
                        <span className="role">Previous block</span>
                        <span className="h">{r.prev}</span>
                      </div>
                    </div>
                    <div style={{ marginTop: 12 }}>
                      {verified[i] ? (
                        <div className="verify-result">
                          <Icon name="circle-check" size={16} />
                          Chain link verified · hash matches
                        </div>
                      ) : r.broken ? (
                        <div className="verify-result is-bad">
                          <Icon name="alert" size={16} />
                          Hash mismatch · chain broken at this block
                        </div>
                      ) : (
                        <button className="btn btn--ghost" style={{ marginTop: 2 }} onClick={() => verify(i)}>
                          <Icon name="circle-check" size={14} /> Verify chain link
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </Fragment>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
          <span style={{ font: "600 12px/1 'Manrope'", color: 'var(--ink-3)' }}>
            Showing {rows.length} of 24,910 entries · chain head <code style={{ fontFamily: "'JetBrains Mono'", fontSize: 11 }}>blk#41 209</code>
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn btn--ghost btn--sm"><Icon name="chev-l" size={13} /> Prev</button>
            <button className="btn btn--ghost btn--sm">Next <Icon name="chev-r" size={13} /></button>
          </div>
        </div>
      </div>
    </>
  );
}
