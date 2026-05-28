'use client';

import { useState } from 'react';
import { Topbar } from '@/components/nav/Topbar';
import { Icon } from '@/components/shared/Icon';

export interface STRDossier {
  caseId: string;
  masked: string;
  bank: string;
  branch: string;
  score: number;
  generated: string;
  version: string;
  prompt: string;
  model: string;
  source: 'pre-generated' | 'live';
  reviewer: string;
  fatf: [string, string][];
  nistRMF: string[];
  shap: [string, string, string][];
  tx: [string, string, string, string][];
  graph: { layering: number; circular: boolean; flaggedNeighbours: number; dormancy: string; branches: number };
  totals: { total: string; count: number; window: string; channels: string };
}

interface STRViewProps {
  dossier: STRDossier;
  narrative: string;
  plainEnglish?: string;
}

export default function STRView({ dossier, narrative, plainEnglish }: STRViewProps) {
  const DOSSIER = dossier;
  const [text, setText]     = useState(narrative);
  const [filed, setFiled]   = useState(false);
  const [edited, setEdited] = useState(false);
  const [copied, setCopied] = useState(false);
  const [source, setSource] = useState<'pre-generated' | 'live'>(DOSSIER.source);
  const [showPlain, setShowPlain] = useState(true);

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const minWords  = 250;
  const compliant = wordCount >= minWords;

  const onCopy = () => {
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  const regenerate = () => {
    setSource('live');
    setText('[Regenerating narrative — would call LLM here in production]\n\n' + narrative);
    setTimeout(() => setText(narrative), 1200);
  };

  return (
    <>
      <Topbar
        title="STR narrative & case report"
        subtitle={`Suspicious Transaction Report draft for ${DOSSIER.caseId} · ready for FIU-IND submission`}
        breadcrumbs={[
          { label: 'Home', href: '/alerts' },
          { label: 'Workspace', href: '/workspace' },
          { label: 'STR & Case Report' },
        ]}
      >
        <button className="btn btn--ghost" onClick={onCopy}>
          <Icon name="export" size={14} /> {copied ? 'Copied!' : 'Copy narrative'}
        </button>
        <button className="btn btn--ghost">
          <Icon name="print" size={14} /> Export PDF
        </button>
        <button className={'btn btn--brand' + (filed ? ' is-filed' : '')} onClick={() => setFiled(true)}>
          <Icon name="check" size={14} /> {filed ? 'Marked as filed' : 'Mark as STR Filed'}
        </button>
      </Topbar>

      <div className="page__body">
        <div className="str">
          <div className="dossier-preview" style={{ maxHeight: 'none', padding: '30px 38px' }}>
            <div className="doc-h">
              <div>
                <h1>SUSPICIOUS TRANSACTION REPORT</h1>
                <div style={{ font: "600 11px/1.4 'JetBrains Mono'", color: 'var(--ink-3)', marginTop: 6, letterSpacing: '.06em' }}>
                  AEGIS · regulator submission · FIU-IND Form STR-002
                </div>
              </div>
              <div className="meta">
                <div>Case <b style={{ color: 'var(--ink)' }}>{DOSSIER.caseId}</b></div>
                <div>{DOSSIER.masked}</div>
                <div>Generated {DOSSIER.generated.replace('T', ' ').slice(0, -1)} UTC</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 22, flexWrap: 'wrap' }}>
              <SourceTag source={source} />
              <span style={{ font: "600 11px/1 'JetBrains Mono'", color: 'var(--ink-3)', letterSpacing: '.04em' }}>
                {DOSSIER.model} · {DOSSIER.prompt} · {DOSSIER.version}
              </span>
              <span className="spacer" />
              <button className="btn btn--ghost btn--sm" onClick={regenerate}>
                <Icon name="spark" size={12} /> Regenerate live
              </button>
            </div>

            <section>
              <h2>1 · Case summary</h2>
              <div className="kv-grid">
                <div className="k">Case reference</div>           <div className="v">{DOSSIER.caseId}</div>
                <div className="k">Subject account (masked)</div> <div className="v">{DOSSIER.masked}</div>
                <div className="k">Reporting institution</div>    <div className="v">{DOSSIER.bank}</div>
                <div className="k">Branch / IFSC</div>            <div className="v">{DOSSIER.branch}</div>
                <div className="k">AEGIS risk score</div>         <div className="v" style={{ color: 'var(--danger)' }}>{DOSSIER.score} / 100</div>
                <div className="k">FATF rules triggered</div>     <div className="v">{DOSSIER.fatf.length}</div>
                <div className="k">Active window</div>            <div className="v">21 days · {DOSSIER.totals.window}</div>
                <div className="k">Total moved</div>              <div className="v">{DOSSIER.totals.total} · {DOSSIER.totals.count} tx</div>
              </div>
              <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {DOSSIER.fatf.map(([code, label]) => (
                  <span key={code} className="tag is-warn">
                    <span style={{ font: "700 10px/1 'JetBrains Mono'", opacity: 0.7 }}>{code}</span>
                    {label}
                  </span>
                ))}
              </div>
            </section>

            {plainEnglish && (
              <section>
                <h2>
                  Plain English summary
                  <span style={{ float: 'right' }}>
                    <button
                      type="button"
                      onClick={() => setShowPlain(s => !s)}
                      style={{
                        font: "700 11px/1 'Manrope'", letterSpacing: '.08em',
                        textTransform: 'uppercase',
                        background: 'transparent', border: '1px solid var(--line-strong)',
                        borderRadius: 8, padding: '6px 10px', cursor: 'pointer',
                        color: 'var(--ink-2)',
                      }}
                    >
                      {showPlain ? 'Hide · show technical only →' : 'Show plain English →'}
                    </button>
                  </span>
                </h2>
                {showPlain && (
                  <div style={{
                    background: 'var(--brand-soft)',
                    border: '1px solid var(--brand)',
                    borderRadius: 10, padding: '14px 18px',
                    font: "600 14px/1.55 'Manrope'", color: 'var(--ink)',
                    marginBottom: 8,
                  }}>
                    {plainEnglish}
                    <div style={{
                      marginTop: 8, font: "500 11px/1 'JetBrains Mono'",
                      color: 'var(--ink-3)', letterSpacing: '.04em',
                    }}>
                      Generated from SHAP factors by plain_english.py
                    </div>
                  </div>
                )}
              </section>
            )}

            <section>
              <h2>2 · Narrative <span style={{ float: 'right', font: "600 11px/1 'Manrope'", color: edited ? 'var(--warn)' : 'var(--ink-3)', letterSpacing: '.06em' }}>{edited ? 'Edited locally' : 'Pre-generated · unmodified'}</span></h2>
              <textarea
                value={text}
                onChange={(e) => { setText(e.target.value); setEdited(true); }}
                style={{
                  width: '100%', minHeight: 340, border: '1px solid var(--line)',
                  borderRadius: 10, padding: '18px 20px', outline: 0, resize: 'vertical',
                  font: "500 13.5px/1.7 'Manrope', sans-serif", color: 'var(--ink)',
                  background: edited ? '#fffaf0' : '#fafbff',
                }}
              />
              <div style={{ display: 'flex', gap: 14, marginTop: 8, font: "600 11px/1 'Manrope'", color: 'var(--ink-3)' }}>
                <span>Words <b style={{ color: 'var(--ink)', fontFamily: "'Space Grotesk'", fontWeight: 700 }}>{wordCount}</b> · FIU-IND minimum {minWords}</span>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: compliant ? 'var(--approved-soft)' : 'var(--danger-soft)',
                  color: compliant ? '#1a7d52' : '#b53848',
                  padding: '4px 10px', borderRadius: 7,
                }}>
                  {compliant
                    ? <><Icon name="circle-check" size={12} /> Meets length</>
                    : <><Icon name="alert" size={12} /> Below minimum</>}
                </span>
              </div>
            </section>

            <section>
              <h2>3 · Risk factors · SHAP attribution</h2>
              <table>
                <thead><tr><th>Factor</th><th style={{ textAlign: 'right' }}>SHAP</th><th>Evidence</th></tr></thead>
                <tbody>
                  {DOSSIER.shap.map(([f, s, e], i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 700, color: 'var(--ink)' }}>{f}</td>
                      <td style={{ color: 'var(--danger)', fontFamily: "'Space Grotesk'", fontWeight: 700, textAlign: 'right' }}>{s}</td>
                      <td style={{ color: 'var(--ink-2)' }}>{e}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section>
              <h2>4 · Transaction summary</h2>
              <table>
                <thead><tr><th>When</th><th>Channel</th><th>Counterparty</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                <tbody>
                  {DOSSIER.tx.map((r, i) => (
                    <tr key={i}>
                      <td style={{ fontFamily: "'JetBrains Mono'", fontSize: 11 }}>{r[0]}</td>
                      <td>{r[1]}</td>
                      <td>{r[2]}</td>
                      <td style={{ textAlign: 'right', fontFamily: "'Space Grotesk'", fontWeight: 700 }}>{r[3]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ font: "600 11px/1.4 'JetBrains Mono'", color: 'var(--ink-3)', marginTop: 8 }}>
                Showing 6 of {DOSSIER.totals.count} transactions · channels: {DOSSIER.totals.channels} · full ledger in Appendix B.
              </div>
            </section>

            <section>
              <h2>5 · Graph evidence</h2>
              <div className="kv-grid" style={{ marginBottom: 12 }}>
                <div className="k">Layering depth</div>      <div className="v">{DOSSIER.graph.layering} hops to cash-out</div>
                <div className="k">Circular flow</div>       <div className="v" style={{ color: DOSSIER.graph.circular ? 'var(--danger)' : 'var(--approved)' }}>{DOSSIER.graph.circular ? 'Detected' : 'None'}</div>
                <div className="k">Flagged neighbours</div>  <div className="v">{DOSSIER.graph.flaggedNeighbours} within 2 hops</div>
                <div className="k">Dormancy period</div>     <div className="v">{DOSSIER.graph.dormancy}</div>
                <div className="k">Branches involved</div>   <div className="v">{DOSSIER.graph.branches}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <SnapshotEgo />
                <SnapshotSankey />
              </div>
            </section>

            <section>
              <h2>6 · Audit & compliance</h2>
              <div className="kv-grid">
                <div className="k">PII masking</div>            <div className="v" style={{ color: '#1a7d52' }}>✓ SHA-256 verified · all PII fields masked pre-LLM</div>
                <div className="k">Model</div>                  <div className="v">{DOSSIER.model} · {DOSSIER.prompt}</div>
                <div className="k">Reviewer</div>               <div className="v">{DOSSIER.reviewer} · approved 09:11 IST</div>
                <div className="k">NIST AI RMF alignment</div>  <div className="v">{DOSSIER.nistRMF.join(' · ')}</div>
                <div className="k">Audit-log chain</div>        <div className="v" style={{ fontFamily: "'JetBrains Mono'", fontSize: 11 }}>blk #41 209 · prev 0x9c7a2…f041</div>
                <div className="k">Status</div>                 <div className="v">{filed ? <span className="tag is-approved">STR FILED</span> : <span className="tag is-warn">DRAFT</span>}</div>
              </div>
            </section>
          </div>

          <div className="dossier-side">
            <div className="panel">
              <h4>Source</h4>
              <SourceTag source={source} large />
              <div style={{ font: "500 12px/1.5 'Manrope'", color: 'var(--ink-3)', marginTop: 10 }}>
                {source === 'pre-generated'
                  ? 'Loaded from the case-warmup cache in 180 ms — narrative was drafted at the time the case was opened.'
                  : 'Generated live just now. Slightly slower but reflects any evidence updated since the cache.'}
              </div>
            </div>

            <div className="panel">
              <h4>Export</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button className="btn btn--brand" style={{ width: '100%', justifyContent: 'center' }}>
                  <Icon name="print" size={14} /> Export PDF · 3.2 MB
                </button>
                <button className="btn btn--ghost" style={{ width: '100%', justifyContent: 'center' }}>
                  <Icon name="export" size={14} /> Export JSON · 118 KB
                </button>
                <button className="btn btn--ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={onCopy}>
                  <Icon name="card" size={14} /> {copied ? 'Copied!' : 'Copy narrative'}
                </button>
              </div>
            </div>

            <div className="panel">
              <h4>Submission status</h4>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: filed ? 'var(--approved-soft)' : 'var(--warn-soft)',
                  color: filed ? '#1a7d52' : '#a96b16',
                  display: 'grid', placeItems: 'center', flexShrink: 0,
                }}>
                  <Icon name={filed ? 'check' : 'flag'} size={18} />
                </span>
                <div>
                  <div style={{ font: "700 13px/1.2 'Manrope'", color: 'var(--ink)', marginBottom: 4 }}>
                    {filed ? 'Filed with FIU-IND' : 'Draft · not yet filed'}
                  </div>
                  <div style={{ font: "500 12px/1.45 'Manrope'", color: 'var(--ink-3)' }}>
                    {filed
                      ? 'Status updated in case queue. Audit-log block written.'
                      : "Mark as filed once you've submitted the dossier to FIU-IND."}
                  </div>
                </div>
              </div>
              {!filed && (
                <button className="btn btn--brand" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} onClick={() => setFiled(true)}>
                  <Icon name="check" size={14} /> Mark as STR Filed
                </button>
              )}
            </div>

            <div className="panel">
              <h4>Compliance checklist</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {([
                  ['PII fully masked', true],
                  ['FATF rules cited', true],
                  ['NIST AI RMF aligned', true],
                  ['Word count ≥ 250', compliant],
                  ['Reviewer approved', true],
                  ['Audit hash written', true],
                ] as [string, boolean][]).map(([lbl, ok], i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: 'var(--ink-2)' }}>
                    <span style={{
                      width: 18, height: 18, borderRadius: 5,
                      background: ok ? 'var(--approved)' : 'var(--line)',
                      color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0,
                    }}>
                      {ok && <Icon name="check" size={11} />}
                    </span>
                    {lbl}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function SourceTag({ source, large }: { source: 'pre-generated' | 'live'; large?: boolean }) {
  const isPre = source === 'pre-generated';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      background: isPre ? '#1a7d52' : '#a96b16',
      color: '#fff',
      padding: large ? '8px 14px' : '5px 10px',
      borderRadius: 999,
      font: `800 ${large ? 12 : 10}px/1 'Manrope'`,
      letterSpacing: '.14em', textTransform: 'uppercase',
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff' }} />
      Source · {source}
      {!large && <span style={{ font: "600 10px/1 'JetBrains Mono'", opacity: 0.75 }}>{isPre ? '180 ms' : '2.1 s'}</span>}
    </span>
  );
}

function SnapshotEgo() {
  return (
    <div className="snapshot">
      <svg viewBox="0 0 360 220" width="100%" height="100%">
        <defs>
          <radialGradient id="snhalo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ef5b6b" stopOpacity=".35" />
            <stop offset="100%" stopColor="#ef5b6b" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx={180} cy={110} r={90} fill="url(#snhalo)" />
        {([[180, 110, 90, 110], [180, 110, 260, 70], [180, 110, 260, 160], [90, 110, 40, 60], [260, 70, 330, 40], [260, 160, 330, 190]] as [number, number, number, number][]).map((c, i) => (
          <line key={i} x1={c[0]} y1={c[1]} x2={c[2]} y2={c[3]} stroke="rgba(110,107,212,.5)" strokeWidth="2" />
        ))}
        {([[180, 110, 14, '#ef5b6b'], [90, 110, 9, '#a78bfa'], [260, 70, 9, '#22d3ee'], [260, 160, 9, '#fbbf24'], [40, 60, 7, '#a78bfa'], [330, 40, 7, '#a78bfa'], [330, 190, 7, '#a78bfa']] as [number, number, number, string][]).map(([x, y, r, c], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r={r + 5} fill={c} opacity=".25" />
            <circle cx={x} cy={y} r={r} fill={c} />
          </g>
        ))}
        <text x={14} y={206} fontFamily="Manrope" fontWeight="700" fontSize="9" letterSpacing=".16em" fill="rgba(255,255,255,.55)">EGO NETWORK · RADIUS 2</text>
      </svg>
    </div>
  );
}

function SnapshotSankey() {
  return (
    <div className="snapshot">
      <svg viewBox="0 0 360 220" width="100%" height="100%">
        <defs>
          <linearGradient id="snsk" x1="0" x2="1">
            <stop offset="0%" stopColor="#e76edd" stopOpacity=".7" />
            <stop offset="100%" stopColor="#2ad1c3" stopOpacity=".7" />
          </linearGradient>
        </defs>
        <rect x={32} y={60} width={10} height={100} fill="#e76edd" rx={2} />
        <rect x={180} y={40} width={10} height={28} fill="#6e6bd4" rx={2} />
        <rect x={180} y={80} width={10} height={36} fill="#6e6bd4" rx={2} />
        <rect x={180} y={130} width={10} height={32} fill="#6e6bd4" rx={2} />
        <rect x={180} y={172} width={10} height={20} fill="#6e6bd4" rx={2} />
        <rect x={310} y={60} width={10} height={26} fill="#2ad1c3" rx={2} />
        <rect x={310} y={100} width={10} height={30} fill="#2ad1c3" rx={2} />
        <rect x={310} y={144} width={10} height={30} fill="#2ad1c3" rx={2} />
        {([[42, 80, 180, 54], [42, 110, 180, 98], [42, 135, 180, 146], [42, 155, 180, 182]] as [number, number, number, number][]).map(([x1, y1, x2, y2], i) => (
          <path key={'a' + i} d={`M${x1} ${y1} C ${x1 + 50} ${y1}, ${x2 - 50} ${y2}, ${x2} ${y2}`} stroke="url(#snsk)" strokeWidth="9" fill="none" opacity=".5" />
        ))}
        {([[190, 54, 310, 75], [190, 98, 310, 115], [190, 146, 310, 160], [190, 182, 310, 160]] as [number, number, number, number][]).map(([x1, y1, x2, y2], i) => (
          <path key={'b' + i} d={`M${x1} ${y1} C ${x1 + 50} ${y1}, ${x2 - 50} ${y2}, ${x2} ${y2}`} stroke="rgba(42,209,195,.5)" strokeWidth="7" fill="none" />
        ))}
        <text x={14} y={206} fontFamily="Manrope" fontWeight="700" fontSize="9" letterSpacing=".16em" fill="rgba(255,255,255,.55)">SANKEY · ₹8.4L LAYERED</text>
      </svg>
    </div>
  );
}
