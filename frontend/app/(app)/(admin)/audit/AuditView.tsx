'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { Topbar } from '@/components/nav/Topbar';
import { Icon } from '@/components/shared/Icon';
import {
  actorInitials,
  familyTone,
  formatTimestamp,
  shortHash,
  type AuditFamily,
  type AuditTrailResponse,
} from '@/lib/audit-shared';

const FAMILIES: AuditFamily[] = ['ALL', 'LOGIN', 'STR', 'CASE', 'SYSTEM', 'API', 'EXPORT'];

const PAGE_SIZE = 50;

interface Props {
  initial: AuditTrailResponse;
}

export function AuditView({ initial }: Props) {
  const [family,   setFamily]   = useState<AuditFamily>('ALL');
  const [search,   setSearch]   = useState('');
  const [offset,   setOffset]   = useState(0);
  const [data,     setData]     = useState<AuditTrailResponse>(initial);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  // Re-fetch whenever filters change.
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(offset));
    if (family !== 'ALL') params.set('family', family);
    if (search.trim())    params.set('search', search.trim());
    setLoading(true);
    setError(null);
    fetch(`/api/audit/trail?${params}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((json: AuditTrailResponse) => { if (!cancelled) setData(json); })
      .catch(e => { if (!cancelled) setError(String(e?.message ?? e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [family, search, offset]);

  const rows = data.rows;
  const integrity = data.integrity;
  const total = data.total;

  const banner = useMemo(() => ({
    totalEvents: integrity.total_entries,
    verified:    integrity.anomalies.length === 0,
    anomalies:   integrity.anomalies.length,
    headBlock:   integrity.head_hash ? `blk#${integrity.total_entries}` : '—',
    headHash:    shortHash(integrity.head_hash),
    headPrev:    shortHash(integrity.head_prev),
  }), [integrity]);

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
            <div className="v">{banner.totalEvents.toLocaleString()}</div>
            <div className="sub">Across hash-chained log</div>
          </div>
          <div className="stat is-chain">
            <div className="lbl">Chain integrity</div>
            <div className="v">{banner.verified ? 'Verified' : 'Broken'}</div>
            <div className="sub">Head {banner.headBlock} · prev {banner.headPrev}</div>
          </div>
          <div className="stat">
            <div className="lbl">Anomalies detected</div>
            <div className="v">{banner.anomalies}</div>
            <div className="sub" style={{ color: banner.verified ? 'var(--approved)' : 'var(--danger)' }}>
              {banner.verified ? 'No broken links' : `${banner.anomalies} suspect entries`}
            </div>
          </div>
          <div className="stat">
            <div className="lbl">Verified window</div>
            <div className="v">{integrity.verified_window.toLocaleString()}</div>
            <div className="sub">Most recent entries</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 220px' }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-4)' }}>
              <Icon name="search" size={15} />
            </span>
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
              placeholder="Search actor, event, case ref…"
              style={{
                width: '100%', paddingLeft: 32, paddingRight: 12, height: 36,
                border: '1px solid var(--line-strong)', borderRadius: 9,
                font: "500 13px/1 'Manrope'", outline: 'none',
                background: '#fff',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            {FAMILIES.map(t => (
              <button
                key={t}
                onClick={() => { setFamily(t); setOffset(0); }}
                style={{
                  height: 32, padding: '0 12px', borderRadius: 7, cursor: 'pointer',
                  font: "700 11px/1 'Manrope'", letterSpacing: '.06em',
                  border: family === t ? '1px solid var(--brand)' : '1px solid var(--line-strong)',
                  background: family === t ? 'var(--brand-soft)' : '#fff',
                  color: family === t ? 'var(--brand-2)' : 'var(--ink-3)',
                }}
              >{t === 'ALL' ? 'All events' : t}</button>
            ))}
          </div>
        </div>

        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--danger-soft)', color: '#b53848', font: "600 12px/1.4 'Manrope'" }}>
            {error}
          </div>
        )}

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
              {loading ? 'Loading…' : 'No events match the current filters.'}
            </div>
          )}

          {rows.map(r => {
            const { date, time } = formatTimestamp(r.timestamp);
            const isOpen = expanded === r.id;
            return (
              <Fragment key={r.id}>
                <div className="audit-row" onClick={() => setExpanded(isOpen ? null : r.id)}>
                  <span className="ts">
                    <b>{date}</b>
                    {time}
                  </span>
                  <span>
                    <span className={'evt ' + familyTone(r.family)}>{r.event.replace(/_/g, ' ')}</span>
                  </span>
                  <span className="role">
                    <span className="av">{actorInitials(r.actor)}</span>
                    {r.actor}
                  </span>
                  <span className="ref">{r.case_ref || '—'}</span>
                  <span className="desc">{r.description}</span>
                  <span className="hash">
                    <b>blk#{r.block_index}</b>
                    <span className="prev">prev {r.prev_hash_short || '—'}</span>
                  </span>
                  <button className="more" onClick={(e) => { e.stopPropagation(); setExpanded(isOpen ? null : r.id); }}>
                    <Icon name={isOpen ? 'chev-u' : 'chev-d'} size={14} />
                  </button>
                </div>

                {isOpen && (
                  <div className="audit-expand">
                    <div>
                      <h5>Payload</h5>
                      <div className="json">{JSON.stringify({
                        event:     r.event,
                        actor:     r.actor,
                        case_ref:  r.case_ref || null,
                        timestamp: r.timestamp,
                        details:   r.details,
                      }, null, 2)}</div>
                    </div>
                    <div>
                      <h5>Chain verification</h5>
                      <div className="chain">
                        <div className="link">
                          <span className="role">This block</span>
                          <span className="h">{r.hash_short || '—'}</span>
                        </div>
                        <div className="arrow">↑</div>
                        <div className="link">
                          <span className="role">Previous block</span>
                          <span className="h">{r.prev_hash_short || '—'}</span>
                        </div>
                      </div>
                      <div style={{ marginTop: 12 }}>
                        <div className="verify-result">
                          <Icon name="circle-check" size={16} />
                          {banner.verified ? 'Chain link verified · hash matches' : 'Chain integrity warning · see anomalies'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
          <span style={{ font: "600 12px/1 'Manrope'", color: 'var(--ink-3)' }}>
            Showing {rows.length} of {total.toLocaleString()} matching · chain head{' '}
            <code style={{ fontFamily: "'JetBrains Mono'", fontSize: 11 }}>{banner.headBlock}</code>
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              className="btn btn--ghost btn--sm"
              disabled={offset === 0 || loading}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              <Icon name="chev-l" size={13} /> Prev
            </button>
            <button
              className="btn btn--ghost btn--sm"
              disabled={offset + PAGE_SIZE >= total || loading}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              Next <Icon name="chev-r" size={13} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
