'use client';

import { useCallback, useEffect, useState } from 'react';
import { Topbar } from '@/components/nav/Topbar';
import { Icon } from '@/components/shared/Icon';

type Status = 'ok' | 'degraded' | 'down';

interface ServiceRow {
  name: string;
  status: Status;
  latency_ms: number;
  message: string;
  metadata: Record<string, unknown>;
  checked_at: number;
}

interface FreshnessRow {
  name: string;
  exists: boolean;
  size_bytes: number;
  age_seconds: number | null;
  stale: boolean;
  status: string;
}

interface ServicesResponse {
  services: ServiceRow[];
  freshness: FreshnessRow[];
  summary: { total: number; degraded: number; all_ok: boolean };
}

interface DlqEntry {
  entry_id: string;
  service: string;
  op: string;
  error: string;
  payload: Record<string, unknown>;
  retries: number;
  when: number;
  last_retry_error?: string;
}

interface DlqResponse {
  total: number;
  entries: DlqEntry[];
}

const SERVICE_ICONS: Record<string, string> = {
  lgbm_model: 'spark',
  gat_model: 'graph',
  parquet_freshness: 'case',
  audit_log: 'shield',
  llm_provider: 'flag',
};

function StatusDot({ status }: { status: Status }) {
  const label = { ok: 'Operational', degraded: 'Degraded', down: 'Down' }[status];
  return (
    <span className="status">
      <i style={{
        background: status === 'down' ? '#b53848'
          : status === 'degraded' ? '#d4a418'
          : 'var(--approved)',
      }} />
      {label}
    </span>
  );
}

function fmtBytes(n: number): string {
  if (!n) return '0';
  if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(1)} GB`;
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

function fmtAge(secs: number | null): string {
  if (secs == null) return 'missing';
  if (secs < 60) return `${Math.floor(secs)} s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} h ago`;
  return `${Math.floor(secs / 86400)} d ago`;
}

function fmtTime(ts: number): string {
  if (!ts) return '—';
  const d = new Date(ts * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

function fmtRelative(ts: number): string {
  if (!ts) return '—';
  const ageSecs = (Date.now() / 1000) - ts;
  return fmtAge(ageSecs);
}

export default function HeartbeatPage() {
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [freshness, setFreshness] = useState<FreshnessRow[]>([]);
  const [dlq, setDlq] = useState<DlqEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [lastPing, setLastPing] = useState<number | null>(null);
  const [pinging, setPinging] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [sres, dres] = await Promise.all([
        fetch('/api/health/services', { cache: 'no-store' }),
        fetch('/api/health/dlq?limit=100', { cache: 'no-store' }),
      ]);
      if (!sres.ok) throw new Error(`/api/health/services → ${sres.status}`);
      if (!dres.ok) throw new Error(`/api/health/dlq → ${dres.status}`);
      const sdata = (await sres.json()) as ServicesResponse;
      const ddata = (await dres.json()) as DlqResponse;
      setServices(sdata.services);
      setFreshness(sdata.freshness);
      setDlq(ddata.entries);
      setLastPing(Date.now() / 1000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load heartbeat');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 10_000);
    return () => clearInterval(t);
  }, [load]);

  const ping = useCallback(async () => {
    setPinging(true);
    await load();
    setPinging(false);
  }, [load]);

  const retry = useCallback(async (entryId: string) => {
    setBusy(entryId);
    try {
      await fetch(`/api/health/dlq/${encodeURIComponent(entryId)}/retry`, { method: 'POST' });
      await load();
    } finally {
      setBusy(null);
    }
  }, [load]);

  const discard = useCallback(async (entryId: string) => {
    setBusy(entryId);
    try {
      await fetch(`/api/health/dlq/${encodeURIComponent(entryId)}/discard`, { method: 'POST' });
      await load();
    } finally {
      setBusy(null);
    }
  }, [load]);

  const degraded = services.filter(s => s.status !== 'ok').length;

  return (
    <>
      <Topbar
        title="Service Health"
        subtitle="Live status from /api/v1/health/services and the dead-letter queue."
        breadcrumbs={[{ label: 'Home', href: '/alerts' }, { label: 'Admin' }, { label: 'Service Health' }]}
      >
        <span style={{ font: "600 11px/1 'JetBrains Mono'", color: 'var(--ink-4)', letterSpacing: '.06em' }}>
          Last refreshed {lastPing ? fmtTime(lastPing) : '—'}
        </span>
        <span className="tag is-warn" style={{ fontSize: 10, padding: '4px 10px', borderRadius: 6, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' }}>Admin only</span>
        <button className="btn btn--ghost" onClick={() => void ping()} disabled={pinging}>
          <Icon name="spark" size={14} /> {pinging ? 'Pinging…' : 'Ping all'}
        </button>
      </Topbar>

      <div className="page__body">
        {err && (
          <div style={{ padding: 16, background: 'var(--danger-soft)', color: '#b53848', borderRadius: 8, marginBottom: 16 }}>
            {err}
          </div>
        )}

        <div className={'hb-overall' + (degraded > 0 ? ' is-partial' : '')}>
          <div className="dot" />
          <div className="copy">
            <div className="lbl">System status</div>
            <h2>{degraded === 0 ? 'All Systems Operational' : `${degraded} Service${degraded > 1 ? 's' : ''} Degraded`}</h2>
            <p>
              {services.length === 0 && loading
                ? 'Loading service snapshot from FastAPI…'
                : degraded === 0
                  ? `All ${services.length} pipeline components healthy.`
                  : 'One or more checks reported non-OK status. See cards below.'}
            </p>
          </div>
          <button className="ping" onClick={() => void ping()}>
            <Icon name="spark" size={14} /> {pinging ? 'Pinging…' : 'Run health check'}
          </button>
        </div>

        <div className="hb-services">
          {services.map(s => {
            const cls = s.status === 'degraded' ? 'hb-card is-degraded'
              : s.status === 'down' ? 'hb-card is-down' : 'hb-card';
            return (
              <div key={s.name} className={cls}>
                <div className="hb-card__head">
                  <div className="ico"><Icon name={SERVICE_ICONS[s.name] ?? 'spark'} size={18} /></div>
                  <div>
                    <h3>{s.name}</h3>
                    <span className="sub">{s.message || 'Check OK'}</span>
                  </div>
                  <StatusDot status={s.status} />
                </div>
                <div className="hb-card__metrics">
                  <div className="hb-card__metric">
                    <div className="k">Latency</div>
                    <div className="v">{s.latency_ms.toFixed(1)}<small>ms</small></div>
                  </div>
                  <div className="hb-card__metric">
                    <div className="k">Checked</div>
                    <div className="v">{fmtRelative(s.checked_at)}</div>
                  </div>
                </div>
                {s.message && s.status !== 'ok' && (
                  <div style={{ font: "600 11.5px/1.4 'Manrope'", color: '#a96b16', background: 'var(--warn-soft)', borderRadius: 8, padding: '8px 10px' }}>
                    {s.message}
                  </div>
                )}
                <div className="hb-card__foot">
                  <span>From SERVICE_CHECKS["{s.name}"]</span>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 'var(--r-card)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--line)' }}>
            <h3 style={{ margin: 0, font: "700 15px/1 'Manrope'", color: 'var(--ink)' }}>Data Freshness</h3>
            <p style={{ margin: '4px 0 0', font: "500 12px/1 'Manrope'", color: 'var(--ink-3)' }}>
              Pipeline artefacts in <code style={{ fontFamily: "'JetBrains Mono'", fontSize: 11 }}>data/processed/</code>
            </p>
          </div>
          <div className="df-row is-head">
            <span>File</span><span>Last updated</span><span>Size</span><span>Status</span><span>Freshness</span>
          </div>
          {freshness.map((f) => (
            <div key={f.name} className="df-row">
              <span className="fn">{f.name}</span>
              <span className="since">{fmtAge(f.age_seconds)}</span>
              <span className="size">{f.exists ? fmtBytes(f.size_bytes) : '—'}</span>
              <span className={'ok' + (f.stale ? ' is-stale' : '')}>
                <Icon name={f.stale ? 'alert' : 'circle-check'} size={13} />
                {f.exists ? (f.stale ? 'Stale' : 'Fresh') : 'Missing'}
              </span>
              <div className={'freshness' + (f.stale ? ' is-stale' : '')}>
                <i style={{ width: f.exists ? (f.stale ? '40%' : '95%') : '0%' }} />
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 'var(--r-card)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ margin: 0, font: "700 15px/1 'Manrope'", color: 'var(--ink)' }}>
                Dead Letter Queue
                <span style={{ marginLeft: 8, font: "700 11px/1 'Manrope'", background: dlq.length ? 'var(--danger-soft)' : 'var(--approved-soft)', color: dlq.length ? '#b53848' : '#1a7d52', padding: '3px 8px', borderRadius: 6, letterSpacing: '.08em' }}>
                  {dlq.length} {dlq.length === 1 ? 'entry' : 'entries'}
                </span>
              </h3>
              <p style={{ margin: '4px 0 0', font: "500 12px/1 'Manrope'", color: 'var(--ink-3)' }}>
                Failed background operations awaiting retry.
              </p>
            </div>
          </div>
          <div className="dlq-row is-head">
            <span>Time</span><span>Service</span><span>Operation</span><span>Error</span><span>Retries</span><span>Action</span>
          </div>
          {dlq.length === 0 && (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink-3)' }}>
              No failed operations.
            </div>
          )}
          {dlq.map((d) => {
            const isMax = d.retries >= 5;
            return (
              <div key={d.entry_id} className="dlq-row">
                <span className="when">{fmtTime(d.when)}</span>
                <span className="svc">{d.service}</span>
                <span className="op">{d.op}</span>
                <span className="err" title={d.last_retry_error || d.error}>
                  {(d.last_retry_error || d.error).slice(0, 80)}
                </span>
                <span className={'retries' + (isMax ? ' is-max' : '')}>{d.retries}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="btn btn--ghost btn--sm"
                    onClick={() => void retry(d.entry_id)}
                    disabled={busy === d.entry_id}
                  >
                    Retry
                  </button>
                  <button
                    className="btn btn--ghost btn--sm"
                    style={{ color: 'var(--danger)', borderColor: 'var(--danger-soft)' }}
                    onClick={() => void discard(d.entry_id)}
                    disabled={busy === d.entry_id}
                  >
                    Discard
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
