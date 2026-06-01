'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/shared/Icon';
import { clearSession } from '@/lib/auth';
import { fetchAlertQueue, postAlertAction } from '@/lib/cases-client';
import type { QueueAlert, ActionResponse } from '@/lib/cases-shared';

type ActionKind = 'approve' | 'flag' | 'freeze';

const ACTION_COPY: Record<ActionKind, { title: string; lead: string; next: string; cls: string; icon: string }> = {
  approve: {
    cls: '',
    icon: 'check',
    title: 'Marked as reviewed',
    lead: 'You confirmed this activity looks legitimate. The case is closed and logged in the audit trail.',
    next: 'Account remains active. No further action needed.',
  },
  flag: {
    cls: 'is-flag',
    icon: 'flag',
    title: 'Flagged for investigator',
    lead: 'Case has been moved to the investigator queue with full evidence attached.',
    next: "Investigator will be assigned. You'll be notified when the case closes.",
  },
  freeze: {
    cls: 'is-freeze',
    icon: 'alert',
    title: 'Account frozen',
    lead: 'Outgoing transactions are blocked. Compliance has been escalated.',
    next: 'Customer will be contacted within 4 hours. Branch lead has been notified.',
  },
};

function fmtAmount(amt?: number): string {
  if (amt == null) return '—';
  if (amt >= 10_000_000) return `₹${(amt / 10_000_000).toFixed(2)}Cr`;
  if (amt >= 100_000) return `₹${(amt / 100_000).toFixed(2)}L`;
  return `₹${amt.toLocaleString('en-IN')}`;
}

function fmtSeconds(s: number): { mm: string; ss: string; urgent: boolean } {
  const safe = Math.max(0, Math.floor(s));
  const mm = String(Math.floor(safe / 60)).padStart(2, '0');
  const ss = String(safe % 60).padStart(2, '0');
  return { mm, ss, urgent: safe < 120 };
}

function topRuleLabel(rules?: string[]): string {
  if (!rules || rules.length === 0) return '—';
  return rules[0].replace(/^rule_/, '').replace(/_/g, ' ');
}

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: 402,
        height: 874,
        borderRadius: 56,
        background: '#fff',
        boxShadow:
          '0 30px 90px rgba(20, 30, 70, .35), 0 0 0 12px #1a1d3a, 0 0 0 14px #2b2f55',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 120,
          height: 28,
          background: '#0e1130',
          borderRadius: 999,
          zIndex: 10,
        }}
      />
      <div style={{ width: '100%', height: '100%', overflowY: 'auto' }}>{children}</div>
    </div>
  );
}

function AlertCard({
  alert,
  index,
  total,
  busy,
  onAction,
}: {
  alert: QueueAlert;
  index: number;
  total: number;
  busy: boolean;
  onAction: (action: ActionKind) => void;
}) {
  const [seconds, setSeconds] = useState(alert.sla_remaining_seconds);
  useEffect(() => setSeconds(alert.sla_remaining_seconds), [alert.case_id]);
  useEffect(() => {
    const t = setInterval(() => setSeconds(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  const { mm, ss, urgent } = fmtSeconds(seconds);
  const score = Math.round(alert.risk_score ?? (alert.priority_score ?? 0) * 100);
  const severity = score >= 75 ? 'High' : score >= 50 ? 'Medium' : 'Low';
  const summary = alert.plain_english || `Case ${alert.case_id} requires triage.`;
  const collapsed = alert.n_alerts_collapsed ?? 0;

  return (
    <div className="scr">
      <div className="scr__top">
        <div className="scr__brand">
          <span className="mark">
            <Icon name="shield" size={16} />
          </span>
          <div>
            AEGIS
            <span className="branch">
              Case · {alert.case_id}
            </span>
          </div>
        </div>
        <div className="scr__bell">
          <Icon name="bell" size={18} />
          <span className="dot" />
        </div>
      </div>

      <div className="scr__divider" />

      <div className="scr__qmeta">
        <span>Alert {index + 1} of {total}</span>
        <span className="ct">
          <i style={{ width: 6, height: 6, borderRadius: 99, background: 'var(--brand)' }} />
          {alert.escalated ? 'Escalated' : 'Awaiting decision'}
        </span>
      </div>

      <div className="scr__hero">
        <div className="scr__hero-row">
          <div className="scr__hero-score" style={{ ['--ring-pct' as never]: score } as React.CSSProperties}>
            <i>
              <span className="n">{score}</span>
              <span className="of">/ 100</span>
            </i>
          </div>
          <div style={{ flex: 1 }}>
            <span className="scr__hero-tag">
              <i /> {severity.toUpperCase()} RISK
            </span>
            <h2>{topRuleLabel(alert.rules_triggered)}</h2>
            <span className="acct">{alert.account_id ?? '—'} · {collapsed} alert{collapsed === 1 ? '' : 's'} collapsed</span>
          </div>
        </div>
      </div>

      <div className="scr__summary">
        <div className="lbl">Why this is flagged</div>
        <p>{summary}</p>
      </div>

      <div className="scr__facts">
        <div className="scr__fact">
          <div className="k">Total moved</div>
          <div className="v">{fmtAmount(alert.total_amount)}</div>
          <div className="sub">across {alert.transaction_count ?? 0} txns</div>
        </div>
        <div className="scr__fact">
          <div className="k">Priority</div>
          <div className="v">{Math.round((alert.priority_score ?? 0) * 100)}</div>
          <div className="sub">case priority score</div>
        </div>
        <div className="scr__fact">
          <div className="k">Rules</div>
          <div className="v">{alert.rules_triggered?.length ?? 0}</div>
          <div className="sub">FATF rules tripped</div>
        </div>
        <div className="scr__fact">
          <div className="k">SLA age</div>
          <div className="v">{Math.floor((alert.age_seconds ?? 0) / 60)}m</div>
          <div className="sub">since alert raised</div>
        </div>
      </div>

      <div className={'scr__timer ' + (urgent ? 'is-urgent' : '')}>
        <div className="clk">{mm}:{ss}</div>
        <div className="info">
          <b className={urgent ? 'is-urgent' : ''}>
            {urgent ? 'Auto-escalating soon' : 'Auto-escalates to investigator'}
          </b>
          <span>
            {urgent
              ? 'Tap an action now — or this alert moves to the investigator queue.'
              : 'If you take no action, this alert moves to the investigator queue.'}
          </span>
        </div>
      </div>

      <div className="scr__actions">
        <button className="bact approve" disabled={busy} onClick={() => onAction('approve')}>
          <Icon name="check" size={20} />
          Approve
        </button>
        <button className="bact flag" disabled={busy} onClick={() => onAction('flag')}>
          <Icon name="flag" size={20} />
          Flag
        </button>
        <button className="bact freeze" disabled={busy} onClick={() => onAction('freeze')}>
          <Icon name="alert" size={20} />
          Freeze
        </button>
      </div>
    </div>
  );
}

function Confirmation({
  alert,
  action,
  result,
  hasNext,
  onNext,
}: {
  alert: QueueAlert;
  action: ActionKind;
  result: ActionResponse;
  hasNext: boolean;
  onNext: () => void;
}) {
  const cfg = ACTION_COPY[action];
  const ts = new Date(result.timestamp * 1000);
  const hh = String(ts.getHours()).padStart(2, '0');
  const mm = String(ts.getMinutes()).padStart(2, '0');
  const ss = String(ts.getSeconds()).padStart(2, '0');
  const shortHash = result.audit_hash.slice(0, 14);

  return (
    <div className="scr">
      <div className="scr__top">
        <div className="scr__brand">
          <span className="mark"><Icon name="shield" size={16} /></span>
          <div>
            AEGIS
            <span className="branch">Case · {alert.case_id}</span>
          </div>
        </div>
        <div className="scr__bell"><Icon name="bell" size={18} /></div>
      </div>

      <div className="scr__divider" />

      <div className={'scr__confirm ' + cfg.cls}>
        <div className="halo"><Icon name={cfg.icon} size={50} /></div>
        <div>
          <h2>{cfg.title}</h2>
          <p className="lead" style={{ marginTop: 8 }}>{cfg.lead}</p>
          <p className="lead" style={{ marginTop: 12, color: 'var(--ink-3)', fontSize: 13 }}>
            {cfg.next}
          </p>
        </div>

        <div className="scr__audit">
          <div>
            <div className="k">Case</div>
            <div className="v ink">{alert.case_id}</div>
          </div>
          <div>
            <div className="k">Action</div>
            <div className="v ink" style={{ textTransform: 'uppercase', letterSpacing: '.06em' }}>{action}</div>
          </div>
          <div>
            <div className="k">Logged</div>
            <div className="v">{hh}:{mm}:{ss} IST</div>
          </div>
          <div>
            <div className="k">Audit hash</div>
            <div
              className="v"
              title={result.audit_hash}
              style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}
            >
              0x{shortHash}…
            </div>
          </div>
        </div>

        <div className="scr__confirm-actions">
          {hasNext && (
            <button className="pbtn primary" onClick={onNext}>
              Next alert <Icon name="chev-r" size={14} />
            </button>
          )}
          <a className="pbtn ghost" href={`/workspace?case=${alert.case_id}`}>
            View case detail
          </a>
        </div>
      </div>
    </div>
  );
}

export default function MobileBranchPage() {
  const router = useRouter();
  const [queue, setQueue] = useState<QueueAlert[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [decided, setDecided] = useState<{ action: ActionKind; result: ActionResponse } | null>(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await fetchAlertQueue('branch_manager', 20);
      setQueue(data.alerts);
      setIdx(0);
      setDecided(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load alert queue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadQueue(); }, [loadQueue]);

  const alert = queue[idx];
  const hasNext = idx < queue.length - 1;

  const onAction = useCallback(async (action: ActionKind) => {
    if (!alert) return;
    setBusy(true);
    setErr(null);
    try {
      const result = await postAlertAction(alert.case_id, action);
      setDecided({ action, result });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }, [alert]);

  const onNext = useCallback(() => {
    setDecided(null);
    setIdx(i => Math.min(queue.length - 1, i + 1));
  }, [queue.length]);

  const sideContent = useMemo(() => (
    <div className="mob-side">
      <span className="mob-side__eyebrow"><i /> BRANCH MANAGER · MOBILE</span>
      <h1>Triage one alert at a time, on the go.</h1>
      <p>
        The branch manager opens the AEGIS app on their phone and sees a single
        flagged case at a time, written in plain English. Three taps — Approve,
        Flag, or Freeze — close the decision loop. Doing nothing auto-escalates
        to the investigator queue.
      </p>

      <div className="legend">
        <div className="item">
          <div className="n">1</div>
          <div className="b">
            <b>Plain-English summary</b>
            <span>Generated from SHAP factors by <code>plain_english.py</code> — no model jargon.</span>
          </div>
        </div>
        <div className="item">
          <div className="n">2</div>
          <div className="b">
            <b>Real auto-escalation timer</b>
            <span>SLA is read from the pending-alerts registry. Silence isn&apos;t approval.</span>
          </div>
        </div>
        <div className="item">
          <div className="n">3</div>
          <div className="b">
            <b>Tamper-evident audit hash</b>
            <span>Every action appends to <code>logs/audit.jsonl</code> with SHA-256 hash chaining.</span>
          </div>
        </div>
      </div>

      <div className="role-pill">
        <div className="av">BM</div>
        <div className="meta">
          <b>Branch Manager</b>
          <span>Logged in via JWT · role &quot;branch_manager&quot;</span>
        </div>
      </div>

      <button
        type="button"
        className="switch-back"
        onClick={() => { clearSession(); router.push('/login'); }}
        style={{ background: 'transparent' }}
      >
        <Icon name="chev-l" size={12} /> Sign out
      </button>

      <button
        type="button"
        className="switch-back"
        onClick={() => void loadQueue()}
        style={{ marginLeft: 12 }}
      >
        Refresh queue
      </button>
    </div>
  ), [loadQueue, router]);

  return (
    <div className="mob-stage">
      {sideContent}
      <div className="mob-phone">
        <PhoneFrame>
          {loading && (
            <div style={{ padding: 80, textAlign: 'center', color: 'var(--ink-3)' }}>
              Loading queue from /api/v1/alerts/queue…
            </div>
          )}
          {!loading && err && (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <h3 style={{ color: 'var(--danger)', marginBottom: 8 }}>Queue error</h3>
              <p style={{ color: 'var(--ink-3)', fontSize: 13 }}>{err}</p>
              <button className="pbtn primary" onClick={() => void loadQueue()} style={{ marginTop: 16 }}>
                Retry
              </button>
            </div>
          )}
          {!loading && !err && queue.length === 0 && (
            <div style={{ padding: 80, textAlign: 'center', color: 'var(--ink-3)' }}>
              <Icon name="check" size={32} />
              <h3 style={{ marginTop: 12, color: 'var(--ink)' }}>Inbox zero</h3>
              <p style={{ marginTop: 6, fontSize: 13 }}>
                No alerts pending for branch_manager. Run the pipeline or
                <br />
                POST a case via /api/v1/cases/generate to seed the queue.
              </p>
            </div>
          )}
          {!loading && !err && alert && (
            decided
              ? <Confirmation alert={alert} action={decided.action} result={decided.result} hasNext={hasNext} onNext={onNext} />
              : <AlertCard alert={alert} index={idx} total={queue.length} busy={busy} onAction={onAction} />
          )}
        </PhoneFrame>
      </div>
    </div>
  );
}
