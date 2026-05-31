'use client';

import Link from 'next/link';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { Topbar } from '@/components/nav/Topbar';
import { Icon } from '@/components/shared/Icon';

type Urgency = 'red' | 'amber' | 'green';

interface AlertRow {
  alert_id: string;
  created_at: number;
  assigned_role: string;
  original_role: string;
  escalated: boolean;
  age_seconds: number;
  sla_remaining_seconds: number;
  metadata: Record<string, unknown>;
}

interface EscalationsResponse {
  total: number;
  timeout_seconds: number;
  escalation_map: Record<string, string>;
  alerts: AlertRow[];
}

function urgencyFromSeconds(s: number): Urgency {
  if (s <= 4 * 3600) return 'red';
  if (s <= 12 * 3600) return 'amber';
  return 'green';
}

function fmtSla(seconds: number): string {
  if (seconds <= 0) return 'overdue';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h >= 24) {
    const days = Math.floor(h / 24);
    return `${days}d ${h % 24}h`;
  }
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function fmtAge(seconds: number): string {
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86400)} d ago`;
}

export default function EscalationPage() {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [meta, setMeta] = useState<Pick<EscalationsResponse, 'timeout_seconds' | 'escalation_map'> | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch('/api/escalations?limit=200', { cache: 'no-store' });
      if (!res.ok) throw new Error(`/api/escalations → ${res.status}`);
      const data = (await res.json()) as EscalationsResponse;
      setAlerts(data.alerts);
      setMeta({ timeout_seconds: data.timeout_seconds, escalation_map: data.escalation_map });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load escalations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 10_000);
    return () => clearInterval(t);
  }, [load]);

  const toggle = (id: string) => setExpanded(expanded === id ? null : id);

  const reassign = useCallback(async (alertId: string, toRole: string) => {
    setBusy(alertId);
    try {
      await fetch(`/api/escalations/${encodeURIComponent(alertId)}/reassign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_role: toRole }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  }, [load]);

  const redCt = alerts.filter(r => urgencyFromSeconds(r.sla_remaining_seconds) === 'red').length;
  const escalatedCt = alerts.filter(r => r.escalated).length;

  return (
    <>
      <Topbar
        title="Escalation Queue"
        subtitle="Live pending-alert registry from /api/v1/escalations. Auto-refreshes every 10s."
        breadcrumbs={[{ label: 'Home', href: '/alerts' }, { label: 'Admin' }, { label: 'Escalation Queue' }]}
      >
        <span className="tag is-warn">Admin only</span>
        <button className="btn btn--ghost" onClick={() => void load()} disabled={loading}>
          <Icon name="spark" size={14} /> {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </Topbar>

      <div className="page__body">
        {err && (
          <div style={{ padding: 16, background: 'var(--danger-soft)', color: '#b53848', borderRadius: 8, marginBottom: 16 }}>
            {err}
          </div>
        )}

        <div className="alert-banner">
          <div className="alert-stat alert-stat--amber">
            <span className="alert-stat__lbl">Pending escalations</span>
            <span className="alert-stat__val">{alerts.length}</span>
            <span className="alert-stat__delta">SLA timeout {meta ? Math.round(meta.timeout_seconds / 60) : '—'} min</span>
          </div>
          <div className="alert-stat alert-stat--red">
            <span className="alert-stat__lbl">SLA breach risk</span>
            <span className="alert-stat__val">{redCt}</span>
            <span className="alert-stat__delta is-down">Under 4 h remaining</span>
          </div>
          <div className="alert-stat alert-stat--brand">
            <span className="alert-stat__lbl">Auto-escalated</span>
            <span className="alert-stat__val">{escalatedCt}</span>
            <span className="alert-stat__delta">Reassigned by background loop</span>
          </div>
          <div className="alert-stat alert-stat--green">
            <span className="alert-stat__lbl">Roles in queue</span>
            <span className="alert-stat__val">{new Set(alerts.map(a => a.assigned_role)).size}</span>
            <span className="alert-stat__delta">Distinct currently assigned</span>
          </div>
        </div>

        <div className="q-table">
          <div className="esc-row is-head">
            <span>SLA remaining</span>
            <span>Case</span>
            <span>Assigned to</span>
            <span>Raised</span>
            <span>Status</span>
            <span>Metadata</span>
            <span style={{ textAlign: 'right' }}>Actions</span>
          </div>

          {!loading && alerts.length === 0 && (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <div style={{ color: 'var(--approved)', marginBottom: 8 }}>
                <Icon name="circle-check" size={28} />
              </div>
              <div style={{ font: "700 14px/1 'Manrope'", color: 'var(--ink)' }}>All clear</div>
              <div style={{ font: "500 12px/1.4 'Manrope'", color: 'var(--ink-3)', marginTop: 6 }}>
                No pending alerts in the registry.
              </div>
            </div>
          )}

          {alerts.map((r) => {
            const urg = urgencyFromSeconds(r.sla_remaining_seconds);
            const nextRole = meta?.escalation_map[r.assigned_role];
            const priority = (r.metadata as { priority_score?: number })?.priority_score;
            return (
              <Fragment key={r.alert_id}>
                <div
                  className={'esc-row urg-' + urg}
                  onClick={() => toggle(r.alert_id)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="urgency">
                    <span className="clk">{fmtSla(r.sla_remaining_seconds)}</span>
                    <span
                      className={'tag urg-' + urg}
                      style={{
                        fontSize: 9, padding: '3px 6px', borderRadius: 5,
                        letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 700,
                        background: urg === 'red' ? 'var(--danger-soft)' : urg === 'amber' ? 'var(--warn-soft)' : 'var(--approved-soft)',
                        color: urg === 'red' ? '#b53848' : urg === 'amber' ? '#a96b16' : '#1a7d52',
                      }}
                    >
                      {urg === 'red' ? 'Breach risk' : urg === 'amber' ? 'Watch' : 'On track'}
                    </span>
                  </div>
                  <div className="case">
                    <b>{r.alert_id}</b>
                    <span>
                      Started as {r.original_role}
                      {r.escalated && r.assigned_role !== r.original_role
                        ? ` · now ${r.assigned_role}` : ''}
                    </span>
                  </div>
                  <div className="assigned">
                    <span className="av">{r.assigned_role.slice(0, 2).toUpperCase()}</span>
                    {r.assigned_role}
                  </div>
                  <div className="since">{fmtAge(r.age_seconds)}</div>
                  <div>
                    <span className={'esc-status ' + (r.escalated ? 's-admin' : '')}>
                      {r.escalated ? 'Auto-escalated' : 'Pending'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {priority != null && (
                      <span style={{
                        fontSize: 10, padding: '3px 7px', borderRadius: 5,
                        background: 'var(--brand-soft)', color: 'var(--brand-2)',
                        fontWeight: 700, letterSpacing: '.06em',
                      }}>
                        priority {Math.round(priority * 100)}
                      </span>
                    )}
                  </div>
                  <div
                    className="esc-actions"
                    style={{ justifyContent: 'flex-end' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button onClick={() => toggle(r.alert_id)}>
                      {expanded === r.alert_id ? 'Collapse' : 'Inspect'}
                    </button>
                    {nextRole && (
                      <button
                        className="primary"
                        disabled={busy === r.alert_id}
                        onClick={() => void reassign(r.alert_id, nextRole)}
                      >
                        {busy === r.alert_id ? '…' : `Reassign → ${nextRole}`}
                      </button>
                    )}
                  </div>
                </div>

                {expanded === r.alert_id && (
                  <div className="esc-expand">
                    <h5>Pending-alert metadata</h5>
                    <pre style={{
                      margin: 0, font: "500 12px/1.6 'JetBrains Mono', monospace",
                      background: '#fff', border: '1px solid var(--line)',
                      borderRadius: 8, padding: 12, color: 'var(--ink-2)',
                      overflowX: 'auto',
                    }}>
{JSON.stringify({
  alert_id: r.alert_id,
  assigned_role: r.assigned_role,
  original_role: r.original_role,
  escalated: r.escalated,
  age_seconds: r.age_seconds,
  sla_remaining_seconds: r.sla_remaining_seconds,
  metadata: r.metadata,
}, null, 2)}
                    </pre>
                    <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                      <Link
                        href={`/workspace?case=${r.alert_id}`}
                        className="btn btn--ghost"
                        style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <Icon name="case" size={14} /> Open workspace
                      </Link>
                      <Link
                        href="/str"
                        className="btn btn--ghost"
                        style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <Icon name="flag" size={14} /> View STR draft
                      </Link>
                    </div>
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>
      </div>
    </>
  );
}
