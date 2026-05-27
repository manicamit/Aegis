'use client';

import { useState } from 'react';
import { Topbar } from '@/components/nav/Topbar';
import { Icon } from '@/components/shared/Icon';

type ServiceStatus = 'ok' | 'degraded' | 'down';

interface Service {
  id: string;
  name: string;
  sub: string;
  status: ServiceStatus;
  icon: string;
  metrics: { k: string; v: string; u: string }[];
  spark: number[];
  uptime: string;
  lastCheck: string;
  note?: string;
}

const SERVICES: Service[] = [
  {
    id: 'risk-engine', name: 'Risk Scoring Engine', sub: 'GAT + XGBoost · v2.4.1', status: 'ok', icon: 'spark',
    metrics: [
      { k: 'Avg latency', v: '38', u: 'ms' }, { k: 'P99 latency', v: '112', u: 'ms' },
      { k: 'Throughput', v: '1,840', u: 'tx/s' }, { k: 'Model drift', v: '0.034', u: '' },
    ],
    spark: [31, 35, 38, 36, 40, 37, 38], uptime: '99.97%', lastCheck: '12 s ago',
  },
  {
    id: 'graph-db', name: 'Transaction Graph', sub: 'NetworkX · 5.2M nodes', status: 'ok', icon: 'graph',
    metrics: [
      { k: 'Query latency', v: '22', u: 'ms' }, { k: 'Cache hit', v: '94', u: '%' },
      { k: 'Edges indexed', v: '18.4M', u: '' }, { k: 'Last ingest', v: '4', u: 'min ago' },
    ],
    spark: [19, 21, 20, 23, 22, 21, 22], uptime: '100%', lastCheck: '8 s ago',
  },
  {
    id: 'api-gw', name: 'API Gateway', sub: 'FastAPI · 6 workers', status: 'ok', icon: 'case',
    metrics: [
      { k: 'Req / min', v: '3,412', u: '' }, { k: 'Error rate', v: '0.02', u: '%' },
      { k: 'Avg latency', v: '14', u: 'ms' }, { k: 'Active conns', v: '284', u: '' },
    ],
    spark: [3100, 3200, 3350, 3280, 3400, 3380, 3412], uptime: '99.99%', lastCheck: '5 s ago',
  },
  {
    id: 'str-gen', name: 'STR Generator', sub: 'Claude claude-3-5 · LLM proxy', status: 'degraded', icon: 'flag',
    metrics: [
      { k: 'Avg latency', v: '4,210', u: 'ms' }, { k: 'P99 latency', v: '11,800', u: 'ms' },
      { k: 'Queue depth', v: '7', u: '' }, { k: 'Error rate', v: '1.4', u: '%' },
    ],
    spark: [2100, 2400, 3100, 3800, 4000, 4100, 4210], uptime: '98.1%', lastCheck: '18 s ago',
    note: 'Elevated latency since 08:31. LLM provider SLA under review.',
  },
  {
    id: 'ingestion', name: 'Alert Ingestion', sub: 'Kafka consumer · topic aegis-alerts', status: 'ok', icon: 'bell',
    metrics: [
      { k: 'Lag', v: '0', u: 'msgs' }, { k: 'Throughput', v: '420', u: 'msg/s' },
      { k: 'Last offset', v: 'blk#41 209', u: '' }, { k: 'Partitions', v: '12/12', u: 'alive' },
    ],
    spark: [410, 415, 418, 422, 419, 421, 420], uptime: '100%', lastCheck: '3 s ago',
  },
  {
    id: 'fiu-connector', name: 'FIU-IND Connector', sub: 'SFTP · PGP-signed · TLS 1.3', status: 'ok', icon: 'shield',
    metrics: [
      { k: 'Last ping', v: '201', u: 'ms' }, { k: 'STRs queued', v: '0', u: '' },
      { k: 'Last submit', v: '2h', u: 'ago' }, { k: 'Cert expiry', v: '74', u: 'days' },
    ],
    spark: [190, 195, 198, 202, 200, 199, 201], uptime: '99.95%', lastCheck: '60 s ago',
  },
];

interface Freshness { name: string; since: string; size: string; ok: string; pct: number; stale?: boolean }
const FRESHNESS: Freshness[] = [
  { name: 'transactions.parquet',       since: '4 min ago',  size: '2.1 GB', ok: 'Fresh', pct: 98 },
  { name: 'feature_matrix.parquet',     since: '18 min ago', size: '340 MB', ok: 'Fresh', pct: 92 },
  { name: 'gat_embeddings.parquet',     since: '2 h ago',    size: '89 MB',  ok: 'Fresh', pct: 75 },
  { name: 'risk_scores.parquet',        since: '4 min ago',  size: '12 MB',  ok: 'Fresh', pct: 98 },
  { name: 'identity_features.parquet',  since: '6 h ago',    size: '1.8 GB', ok: 'Stale', pct: 40, stale: true },
  { name: 'transaction_graph.gpickle',  since: '4 min ago',  size: '614 MB', ok: 'Fresh', pct: 98 },
  { name: 'graph_features.parquet',     since: '4 h ago',    size: '56 MB',  ok: 'Stale', pct: 50, stale: true },
];

interface DLQEntry { when: string; svc: string; op: string; err: string; retries: number; max: boolean }
const DLQ: DLQEntry[] = [
  { when: '09:14', svc: 'STR Generator', op: 'str_generate', err: 'LLM timeout after 30s',           retries: 3, max: false },
  { when: '08:31', svc: 'STR Generator', op: 'str_generate', err: 'upstream 503 from anthropic-api', retries: 5, max: true  },
  { when: '07:58', svc: 'FIU Connector', op: 'sftp_submit',  err: 'PGP sign failed: key expired',     retries: 2, max: false },
];

function SparkLine({ vals }: { vals: number[] }) {
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const w = 100, h = 36;
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  });
  const lastPt = pts[pts.length - 1].split(',');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} style={{ display: 'block' }}>
      <polyline points={pts.join(' ')} fill="none" stroke="var(--brand)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastPt[0]} cy={lastPt[1]} r="3" fill="var(--brand)" />
    </svg>
  );
}

function StatusDot({ status }: { status: ServiceStatus }) {
  const labels: Record<ServiceStatus, string> = { ok: 'Operational', degraded: 'Degraded', down: 'Down' };
  return <span className="status"><i />{labels[status]}</span>;
}

function HbCard({ svc }: { svc: Service }) {
  const cls = svc.status === 'degraded' ? 'hb-card is-degraded' : svc.status === 'down' ? 'hb-card is-down' : 'hb-card';
  return (
    <div className={cls}>
      <div className="hb-card__head">
        <div className="ico"><Icon name={svc.icon} size={18} /></div>
        <div>
          <h3>{svc.name}</h3>
          <span className="sub">{svc.sub}</span>
        </div>
        <StatusDot status={svc.status} />
      </div>
      <div className="hb-card__metrics">
        {svc.metrics.map((m, i) => (
          <div key={i} className="hb-card__metric">
            <div className="k">{m.k}</div>
            <div className="v">{m.v}<small>{m.u}</small></div>
          </div>
        ))}
      </div>
      <div className="hb-card__spark"><SparkLine vals={svc.spark} /></div>
      {svc.note && (
        <div style={{ font: "600 11.5px/1.4 'Manrope'", color: '#a96b16', background: 'var(--warn-soft)', borderRadius: 8, padding: '8px 10px' }}>
          {svc.note}
        </div>
      )}
      <div className="hb-card__foot">
        <span>Uptime {svc.uptime} · checked {svc.lastCheck}</span>
        <a href="#">Logs →</a>
      </div>
    </div>
  );
}

export default function HeartbeatPage() {
  const [pinging, setPinging]   = useState(false);
  const [lastPing, setLastPing] = useState('09:14:52');

  const ping = () => {
    setPinging(true);
    setTimeout(() => {
      setPinging(false);
      const now = new Date();
      setLastPing(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`);
    }, 1200);
  };

  const degraded = SERVICES.filter(s => s.status !== 'ok').length;

  return (
    <>
      <Topbar
        title="Service Health"
        subtitle="Real-time status of all AEGIS pipeline components."
        breadcrumbs={[{ label: 'Home', href: '/alerts' }, { label: 'Admin' }, { label: 'Service Health' }]}
      >
        <span style={{ font: "600 11px/1 'JetBrains Mono'", color: 'var(--ink-4)', letterSpacing: '.06em' }}>
          Last refreshed {lastPing}
        </span>
        <span className="tag is-warn" style={{ fontSize: 10, padding: '4px 10px', borderRadius: 6, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' }}>Admin only</span>
        <button className="btn btn--ghost" onClick={ping} disabled={pinging}>
          <Icon name="spark" size={14} /> {pinging ? 'Pinging…' : 'Ping all'}
        </button>
      </Topbar>

      <div className="page__body">
        <div className={'hb-overall' + (degraded > 0 ? ' is-partial' : '')}>
          <div className="dot" />
          <div className="copy">
            <div className="lbl">System status</div>
            <h2>{degraded === 0 ? 'All Systems Operational' : `${degraded} Service${degraded > 1 ? 's' : ''} Degraded`}</h2>
            <p>
              {degraded === 0
                ? 'All 6 pipeline components are healthy. No incidents in the last 24 h.'
                : 'STR Generator latency elevated since 08:31. All other services nominal.'}
            </p>
          </div>
          <button className="ping" onClick={ping}>
            <Icon name="spark" size={14} /> {pinging ? 'Pinging…' : 'Run health check'}
          </button>
        </div>

        <div className="hb-services">
          {SERVICES.map(s => <HbCard key={s.id} svc={s} />)}
        </div>

        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 'var(--r-card)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--line)' }}>
            <h3 style={{ margin: 0, font: "700 15px/1 'Manrope'", color: 'var(--ink)' }}>Data Freshness</h3>
            <p style={{ margin: '4px 0 0', font: "500 12px/1 'Manrope'", color: 'var(--ink-3)' }}>
              Processed artefacts in <code style={{ fontFamily: "'JetBrains Mono'", fontSize: 11 }}>data/processed/</code>
            </p>
          </div>
          <div className="df-row is-head">
            <span>File</span><span>Last updated</span><span>Size</span><span>Status</span><span>Freshness</span>
          </div>
          {FRESHNESS.map((f, i) => (
            <div key={i} className="df-row">
              <span className="fn">{f.name}</span>
              <span className="since">{f.since}</span>
              <span className="size">{f.size}</span>
              <span className={'ok' + (f.stale ? ' is-stale' : '')}>
                <Icon name={f.stale ? 'alert' : 'circle-check'} size={13} />{f.ok}
              </span>
              <div className={'freshness' + (f.stale ? ' is-stale' : '')}>
                <i style={{ width: f.pct + '%' }} />
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 'var(--r-card)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ margin: 0, font: "700 15px/1 'Manrope'", color: 'var(--ink)' }}>
                Dead Letter Queue
                <span style={{ marginLeft: 8, font: "700 11px/1 'Manrope'", background: 'var(--danger-soft)', color: '#b53848', padding: '3px 8px', borderRadius: 6, letterSpacing: '.08em' }}>
                  {DLQ.length} pending
                </span>
              </h3>
              <p style={{ margin: '4px 0 0', font: "500 12px/1 'Manrope'", color: 'var(--ink-3)' }}>Events that failed all retry attempts.</p>
            </div>
            <button className="btn btn--ghost btn--sm">Retry all</button>
          </div>
          <div className="dlq-row is-head">
            <span>Time</span><span>Service</span><span>Operation</span><span>Error</span><span>Retries</span><span>Action</span>
          </div>
          {DLQ.map((d, i) => (
            <div key={i} className="dlq-row">
              <span className="when">{d.when}</span>
              <span className="svc">{d.svc}</span>
              <span className="op">{d.op}</span>
              <span className="err">{d.err}</span>
              <span className={'retries' + (d.max ? ' is-max' : '')}>{d.retries}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn--ghost btn--sm">Retry</button>
                <button className="btn btn--ghost btn--sm" style={{ color: 'var(--danger)', borderColor: 'var(--danger-soft)' }}>Discard</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
