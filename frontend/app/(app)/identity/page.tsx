'use client';

import { useMemo, useState } from 'react';
import { Topbar } from '@/components/nav/Topbar';
import { Icon } from '@/components/shared/Icon';

type SignalId = 'device' | 'ip' | 'beneficiary' | 'upi' | 'phone';
type Severity  = 'danger' | 'warn' | 'info';

interface Signal {
  id: SignalId;
  label: string;
  color: string;
}

interface Account {
  id: string;
  label: string;
  bank: string;
  cluster: string;
  flagged: boolean;
  x: number;
  y: number;
}

interface Link {
  a: string;
  b: string;
  type: SignalId;
}

interface Cluster {
  id: string;
  title: string;
  density: number;
  severity: Severity;
  accounts: string[];
  signals: SignalId[];
}

const SIGNALS: Signal[] = [
  { id: 'device',      label: 'Shared Device',      color: '#2ad1c3' },
  { id: 'ip',          label: 'Shared IP',          color: '#fbbf24' },
  { id: 'beneficiary', label: 'Shared Beneficiary', color: '#a78bfa' },
  { id: 'upi',         label: 'Shared UPI Handle',  color: '#22d3ee' },
  { id: 'phone',       label: 'Shared Phone',       color: '#f08a5d' },
];

const ACCOUNTS: Account[] = [
  { id: 'a1', label: '·8841', bank: 'ICICI · MUM',    cluster: 'S-19', flagged: true,  x: 160, y: 180 },
  { id: 'a2', label: '·5503', bank: 'Axis · PNE',     cluster: 'S-19', flagged: false, x: 250, y:  90 },
  { id: 'a3', label: '·9082', bank: 'HDFC · PNE',     cluster: 'S-19', flagged: true,  x: 340, y: 180 },
  { id: 'a4', label: '·1199', bank: 'Kotak · MUM',    cluster: 'S-19', flagged: false, x: 250, y: 260 },
  { id: 'a5', label: '·6620', bank: 'PNB · LDH',      cluster: 'S-19', flagged: false, x: 160, y: 350 },
  { id: 'b1', label: '·4421', bank: 'Canara · BLG',   cluster: 'G-04', flagged: true,  x: 540, y: 120 },
  { id: 'b2', label: '·8801', bank: 'BoB · SRT',      cluster: 'G-04', flagged: false, x: 620, y: 200 },
  { id: 'b3', label: '·2210', bank: 'IndusInd · MUM', cluster: 'G-04', flagged: false, x: 540, y: 280 },
  { id: 'c1', label: '·5557', bank: 'Axis · PNE',     cluster: 'L-22', flagged: false, x: 480, y: 410 },
  { id: 'c2', label: '·7712', bank: 'Federal · KCH',  cluster: 'L-22', flagged: false, x: 570, y: 470 },
  { id: 'c3', label: '·0091', bank: 'Yes · PNE',      cluster: 'L-22', flagged: true,  x: 380, y: 470 },
  { id: 'c4', label: '·3398', bank: 'SBI · HYD',      cluster: 'L-22', flagged: false, x: 290, y: 410 },
];

const LINKS: Link[] = [
  { a: 'a1', b: 'a2', type: 'device' },
  { a: 'a2', b: 'a3', type: 'device' },
  { a: 'a1', b: 'a3', type: 'upi' },
  { a: 'a3', b: 'a4', type: 'phone' },
  { a: 'a4', b: 'a5', type: 'beneficiary' },
  { a: 'a1', b: 'a5', type: 'beneficiary' },
  { a: 'a2', b: 'a4', type: 'ip' },
  { a: 'a1', b: 'a4', type: 'device' },
  { a: 'b1', b: 'b2', type: 'phone' },
  { a: 'b2', b: 'b3', type: 'beneficiary' },
  { a: 'b1', b: 'b3', type: 'ip' },
  { a: 'c1', b: 'c2', type: 'ip' },
  { a: 'c2', b: 'c3', type: 'upi' },
  { a: 'c3', b: 'c4', type: 'ip' },
  { a: 'c1', b: 'c4', type: 'device' },
  { a: 'a3', b: 'b1', type: 'beneficiary' },
];

const CLUSTERS: Cluster[] = [
  { id: 'S-19', title: 'Mule cluster S-19',  density: 0.86, severity: 'danger', accounts: ['a1', 'a2', 'a3', 'a4', 'a5'], signals: ['device', 'upi', 'beneficiary', 'phone', 'ip'] },
  { id: 'G-04', title: 'Linkage group G-04', density: 0.52, severity: 'warn',   accounts: ['b1', 'b2', 'b3'],             signals: ['phone', 'beneficiary', 'ip'] },
  { id: 'L-22', title: 'Loose linkage L-22', density: 0.28, severity: 'info',   accounts: ['c1', 'c2', 'c3', 'c4'],       signals: ['ip', 'upi', 'device'] },
];

const sevColor = (s: Severity) => s === 'danger' ? '#ef5b6b' : s === 'warn' ? '#e9a13b' : '#34d399';

export default function IdentityPage() {
  const [enabled, setEnabled]               = useState<Set<SignalId>>(new Set(SIGNALS.map(s => s.id)));
  const [activeCluster, setActiveCluster]   = useState<string>('S-19');

  const visibleLinks = useMemo(() => LINKS.filter(l => enabled.has(l.type)), [enabled]);
  const cluster      = CLUSTERS.find(c => c.id === activeCluster)!;
  const clusterAccts = ACCOUNTS.filter(a => cluster.accounts.includes(a.id));

  const toggleSignal = (id: SignalId) => {
    setEnabled(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <>
      <Topbar
        title="Device & Identity Linking"
        subtitle="Accounts joined by shared devices, IPs, UPI handles, beneficiaries or phone numbers — even when no transaction flows between them."
        breadcrumbs={[{ label: 'Home', href: '/alerts' }, { label: 'Identity Linking' }]}
      >
        <button className="btn btn--ghost"><Icon name="export" size={14} /> Export cluster</button>
        <button className="btn btn--brand"><Icon name="alert" size={14} /> Escalate ring</button>
      </Topbar>

      <div className="page__body">
        <div className="ident-toolbar">
          <span className="label">Signals</span>
          {SIGNALS.map(s => (
            <span
              key={s.id}
              className={'link-toggle ' + (enabled.has(s.id) ? 'on' : '')}
              onClick={() => toggleSignal(s.id)}
            >
              <span className="sw" style={{ background: enabled.has(s.id) ? s.color : undefined }} />
              {s.label}
            </span>
          ))}
          <span className="spacer" style={{ flex: 1 }} />
          <span className="muted" style={{ fontSize: 12 }}>
            {visibleLinks.length} active linkages · {CLUSTERS.length} clusters
          </span>
        </div>

        <div className="ident">
          <div className="ident-canvas">
            <IdentGraph
              accounts={ACCOUNTS}
              links={visibleLinks}
              activeCluster={activeCluster}
              onClickCluster={setActiveCluster}
            />

            <div className="darkpanel" style={{ position: 'absolute', left: 16, top: 16, minWidth: 200 }}>
              <h5>Edge legend</h5>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {SIGNALS.filter(s => enabled.has(s.id)).map(s => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <span style={{ width: 18, height: 2, background: s.color, borderRadius: 2 }} />
                    <span style={{ color: 'rgba(230,235,255,.8)' }}>{s.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="darkpanel" style={{ position: 'absolute', right: 16, top: 16, minWidth: 200 }}>
              <h5>Clusters</h5>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {CLUSTERS.map(c => (
                  <div
                    key={c.id}
                    onClick={() => setActiveCluster(c.id)}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '6px 8px', borderRadius: 8, cursor: 'pointer',
                      background: c.id === activeCluster ? 'rgba(110,107,212,.25)' : 'transparent',
                      border: c.id === activeCluster ? '1px solid rgba(110,107,212,.4)' : '1px solid transparent',
                    }}
                  >
                    <div>
                      <div style={{ font: "700 12px/1 'Manrope'", color: '#fff' }}>{c.title}</div>
                      <div style={{ font: "500 10.5px/1 'JetBrains Mono'", color: 'rgba(255,255,255,.55)', marginTop: 3 }}>
                        {c.accounts.length} accts · density {c.density.toFixed(2)}
                      </div>
                    </div>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: sevColor(c.severity),
                      boxShadow: `0 0 8px ${sevColor(c.severity)}`,
                    }} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="cluster-card">
              <div className="head">
                <h3>{cluster.title}</h3>
                <span
                  className="badge"
                  style={{
                    background: cluster.severity === 'danger' ? 'var(--danger-soft)' : cluster.severity === 'warn' ? 'var(--warn-soft)' : 'var(--info-soft)',
                    color:      cluster.severity === 'danger' ? '#b53848'            : cluster.severity === 'warn' ? '#a96b16'            : '#1a4a91',
                  }}
                >
                  {cluster.severity === 'danger' ? 'Mule ring' : cluster.severity === 'warn' ? 'Watch' : 'Soft link'}
                </span>
              </div>
              <div className="density">
                <span>Cluster density</span>
                <b>{cluster.density.toFixed(2)}</b>
              </div>
              <div>
                <div style={{ font: "700 11px/1 'Manrope'", letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 6 }}>
                  Accounts ({cluster.accounts.length})
                </div>
                {clusterAccts.map(a => (
                  <div key={a.id} className="acct-line">
                    <span className="sw" style={{ background: a.flagged ? 'var(--danger)' : 'var(--ink-4)', opacity: a.flagged ? 1 : 0.5 }} />
                    <div>
                      <b>{a.bank} · {a.label}</b>
                      <span>{a.flagged ? 'Flagged' : 'Clean record'}</span>
                    </div>
                    <Icon name="chev-r" size={14} />
                  </div>
                ))}
              </div>
              <div>
                <div style={{ font: "700 11px/1 'Manrope'", letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 6 }}>
                  Signal types
                </div>
                <div className="signals">
                  {cluster.signals.map(s => {
                    const sig = SIGNALS.find(x => x.id === s)!;
                    return (
                      <span key={s} className="chip" style={{ background: sig.color + '22', color: 'var(--ink)' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: sig.color }} />
                        {sig.label}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn--ghost btn--sm" style={{ flex: 1 }}>+ Add to case</button>
                <button className="btn btn--brand btn--sm" style={{ flex: 1 }}>Escalate</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

interface IdentGraphProps {
  accounts: Account[];
  links: Link[];
  activeCluster: string;
  onClickCluster: (id: string) => void;
}

function IdentGraph({ accounts, links, activeCluster, onClickCluster }: IdentGraphProps) {
  const W = 720, H = 560;

  const clusterBoxes = useMemo(() => CLUSTERS.map(c => {
    const pts = accounts.filter(a => c.accounts.includes(a.id));
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const minX = Math.min(...xs) - 50, maxX = Math.max(...xs) + 50;
    const minY = Math.min(...ys) - 70, maxY = Math.max(...ys) + 50;
    return { c, x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }), [accounts]);

  const activeAccountIds = new Set(CLUSTERS.find(c => c.id === activeCluster)!.accounts);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" width="100%" height="100%" style={{ display: 'block' }}>
      <defs>
        <filter id="iglow"><feGaussianBlur stdDeviation="3" /></filter>
      </defs>

      {clusterBoxes.map(({ c, x, y, w, h }) => {
        const isActive = c.id === activeCluster;
        const stroke = sevColor(c.severity);
        return (
          <g key={c.id} style={{ cursor: 'pointer' }} onClick={() => onClickCluster(c.id)}>
            <rect
              x={x} y={y} width={w} height={h} rx={20} ry={20}
              fill={isActive ? stroke + '18' : 'rgba(255,255,255,.03)'}
              stroke={isActive ? stroke : 'rgba(255,255,255,.1)'}
              strokeWidth={isActive ? 1.5 : 1}
              strokeDasharray={isActive ? 'none' : '4 6'}
            />
            <text
              x={x + 14} y={y + 22}
              fontFamily="Manrope" fontWeight="800" fontSize="11" letterSpacing=".14em"
              fill={isActive ? stroke : 'rgba(255,255,255,.5)'}
            >
              {c.id.toUpperCase()}
            </text>
          </g>
        );
      })}

      {links.map((l, i) => {
        const A = accounts.find(a => a.id === l.a);
        const B = accounts.find(a => a.id === l.b);
        if (!A || !B) return null;
        const sig = SIGNALS.find(s => s.id === l.type)!;
        const mx = (A.x + B.x) / 2 + (i % 2 ? -6 : 6);
        const my = (A.y + B.y) / 2;
        return (
          <g key={i}>
            <path d={`M${A.x} ${A.y} Q ${mx} ${my} ${B.x} ${B.y}`} stroke={sig.color} strokeWidth={1.8} fill="none" opacity={0.55} />
            <text
              x={(A.x + B.x) / 2} y={(A.y + B.y) / 2 - 4}
              fontFamily="'JetBrains Mono'" fontWeight="500" fontSize="8.5"
              fill={sig.color} opacity={0.85}
              textAnchor="middle"
              style={{ pointerEvents: 'none' }}
            >
              {l.type.toUpperCase()}
            </text>
          </g>
        );
      })}

      {accounts.map(a => {
        const isActive = activeAccountIds.has(a.id);
        const color = a.flagged ? '#ef5b6b' : '#a78bfa';
        return (
          <g key={a.id}>
            <circle cx={a.x} cy={a.y} r={20} fill={color} opacity={isActive ? 0.25 : 0.12} filter="url(#iglow)" />
            <circle cx={a.x} cy={a.y} r={13} fill={color} opacity={isActive ? 1 : 0.7} />
            <circle cx={a.x} cy={a.y} r={9} fill="#0a0c25" opacity=".22" />
            {a.flagged && (
              <text x={a.x} y={a.y + 4} fontFamily="Manrope" fontWeight="800" fontSize="11" fill="#fff" textAnchor="middle">!</text>
            )}
            <text x={a.x} y={a.y + 26} fontFamily="Manrope" fontWeight="700" fontSize="11" fill={isActive ? '#fff' : 'rgba(230,235,255,.7)'} textAnchor="middle">
              {a.label}
            </text>
            <text x={a.x} y={a.y + 38} fontFamily="'JetBrains Mono'" fontWeight="500" fontSize="9" fill="rgba(230,235,255,.45)" textAnchor="middle">
              {a.bank}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
