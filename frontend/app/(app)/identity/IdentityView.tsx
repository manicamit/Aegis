'use client';

import { useMemo, useState } from 'react';
import { Topbar } from '@/components/nav/Topbar';
import { Icon } from '@/components/shared/Icon';
import type { SignalType } from '@/types/aegis';
import {
  layoutIdentity,
  sevColor,
  type ApiIdentityResponse,
  type PositionedAccount,
  type ApiIdentityLink,
  type ApiSignalDef,
  type ClusterBox,
} from '@/lib/identity-shared';

interface Props {
  data: ApiIdentityResponse;
}

export function IdentityView({ data }: Props) {
  const [enabled, setEnabled]             = useState<Set<SignalType>>(
    () => new Set(data.signals.map(s => s.id)),
  );
  const [activeCluster, setActiveCluster] = useState<string>(
    () => data.clusters[0]?.id ?? '',
  );

  const layout = useMemo(() => layoutIdentity(data), [data]);
  const visibleLinks = useMemo(
    () => data.links.filter(l => enabled.has(l.type)),
    [data.links, enabled],
  );

  const cluster = data.clusters.find(c => c.id === activeCluster) ?? data.clusters[0];
  const clusterAccts = layout.accounts.filter(a => cluster?.accounts.includes(a.id));

  const toggleSignal = (id: SignalType) => {
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
          {data.signals.map(s => (
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
            {visibleLinks.length} active linkages · {data.clusters.length} clusters
          </span>
        </div>

        <div className="ident">
          <div className="ident-canvas">
            {data.clusters.length === 0 ? (
              <EmptyCanvas />
            ) : (
              <IdentGraph
                accounts={layout.accounts}
                boxes={layout.boxes}
                links={visibleLinks}
                signals={data.signals}
                activeCluster={cluster?.id ?? ''}
                onClickCluster={setActiveCluster}
              />
            )}

            <div className="darkpanel" style={{ position: 'absolute', left: 16, top: 16, minWidth: 200 }}>
              <h5>Edge legend</h5>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {data.signals.filter(s => enabled.has(s.id)).map(s => (
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
                {data.clusters.map(c => (
                  <div
                    key={c.id}
                    onClick={() => setActiveCluster(c.id)}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '6px 8px', borderRadius: 8, cursor: 'pointer',
                      background: c.id === cluster?.id ? 'rgba(110,107,212,.25)' : 'transparent',
                      border: c.id === cluster?.id ? '1px solid rgba(110,107,212,.4)' : '1px solid transparent',
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
            {cluster ? (
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
                      const sig = data.signals.find(x => x.id === s);
                      if (!sig) return null;
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
            ) : (
              <div className="cluster-card">
                <div className="head"><h3>No clusters detected</h3></div>
                <p style={{ font: "500 13px/1.5 'Manrope'", color: 'var(--ink-3)' }}>
                  Identity linking did not surface any mule-ring candidates from the current dataset.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function EmptyCanvas() {
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
      color: 'rgba(230,235,255,.5)', font: "600 13px/1.5 'Manrope'", textAlign: 'center',
    }}>
      Identity-linkage graph unavailable.
      <br />
      <span style={{ fontSize: 11, color: 'rgba(230,235,255,.35)', marginTop: 4 }}>
        Run the identity-features pipeline to populate this view.
      </span>
    </div>
  );
}

interface IdentGraphProps {
  accounts: PositionedAccount[];
  boxes:    ClusterBox[];
  links:    ApiIdentityLink[];
  signals:  ApiSignalDef[];
  activeCluster: string;
  onClickCluster: (id: string) => void;
}

function IdentGraph({ accounts, boxes, links, signals, activeCluster, onClickCluster }: IdentGraphProps) {
  const W = 720, H = 560;
  const activeAccountIds = useMemo(() => {
    const box = boxes.find(b => b.cluster.id === activeCluster);
    return new Set(box?.cluster.accounts ?? []);
  }, [boxes, activeCluster]);
  const sigColor = (t: SignalType) => signals.find(s => s.id === t)?.color ?? '#a78bfa';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" width="100%" height="100%" style={{ display: 'block' }}>
      <defs>
        <filter id="iglow"><feGaussianBlur stdDeviation="3" /></filter>
      </defs>

      {boxes.map(({ cluster: c, x, y, w, h }) => {
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
              {c.title.toUpperCase()}
            </text>
          </g>
        );
      })}

      {links.map((l, i) => {
        const A = accounts.find(a => a.id === l.a);
        const B = accounts.find(a => a.id === l.b);
        if (!A || !B) return null;
        const color = sigColor(l.type);
        const mx = (A.x + B.x) / 2 + (i % 2 ? -6 : 6);
        const my = (A.y + B.y) / 2;
        return (
          <g key={`${l.a}-${l.b}-${i}`}>
            <path d={`M${A.x} ${A.y} Q ${mx} ${my} ${B.x} ${B.y}`} stroke={color} strokeWidth={1.8} fill="none" opacity={0.55} />
            <text
              x={(A.x + B.x) / 2} y={(A.y + B.y) / 2 - 4}
              fontFamily="'JetBrains Mono'" fontWeight="500" fontSize="8.5"
              fill={color} opacity={0.85}
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
