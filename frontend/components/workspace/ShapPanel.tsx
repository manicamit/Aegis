'use client';

import { useMemo, useState } from 'react';
import type { FatfRule, ShapFeature } from '@/types/aegis';

type ShapView = 'chart' | 'text';

export interface ShapPanelProps {
  /** Plain-English summary from the API. */
  plainEnglish?: string;
  /** SHAP risk-factor strings from the API, e.g. "+ coordinated burst (impact: 0.28)". */
  riskFactors?: string[];
  /** Aggregate risk score (0-100). */
  score?: number;
  /** FATF rules from the case dossier. */
  fatfRules?: FatfRule[];
}

const FACTOR_REGEX = /^([+\-])\s*(.+?)\s*\(impact:\s*([\d.+\-]+)\)\s*$/i;

function parseRiskFactors(factors: string[]): ShapFeature[] {
  return factors.map(raw => {
    const m = FACTOR_REGEX.exec(raw);
    if (!m) {
      return { feat: raw.replace(/^[+\-]\s*/, ''), v: 0, raw };
    }
    const sign = m[1] === '-' ? -1 : 1;
    const v = sign * Math.abs(Number(m[3]) || 0);
    return { feat: m[2], v, raw: `impact ${m[3]}` };
  }).filter(f => f.feat);
}

export function ShapPanel({ plainEnglish, riskFactors, score, fatfRules }: ShapPanelProps = {}) {
  const [view, setView] = useState<ShapView>('chart');
  const shapFeatures = useMemo(() => parseRiskFactors(riskFactors ?? []), [riskFactors]);
  const rules = fatfRules ?? [];
  const displayScore = score ?? null;

  return (
    <div className="shap">
      <div className="shap__head">
        <h3>Why this score</h3>
        <div className="shap__seg">
          <button className={view === 'chart' ? 'is-on' : ''} onClick={() => setView('chart')}>Chart</button>
          <button className={view === 'text'  ? 'is-on' : ''} onClick={() => setView('text')}>Plain text</button>
        </div>
      </div>

      <div className="shap__big">
        <span className="n">{displayScore != null ? displayScore : '—'}</span>
        <span className="of">/ 100</span>
      </div>

      {view === 'chart' ? (
        <div className="shap__bars">
          <div style={{ display: 'flex', justifyContent: 'space-between', font: "600 10px/1 'Manrope'", letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
            <span>Pushes away ←</span>
            <span>→ Pushes toward fraud</span>
          </div>
          {shapFeatures.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--ink-3)', padding: '12px 0' }}>
              No SHAP factors returned for this case.
            </div>
          ) : shapFeatures.map((s, i) => (
            <div key={i} className="shap__bar" title={s.raw}>
              <div className="label">{s.feat}<span className="val">{s.raw}</span></div>
              <div className="track">
                <span className="center" />
                {s.v > 0 ? (
                  <>
                    <span className="fill is-pos" style={{ width: `${Math.min(50, Math.abs(s.v) * 130)}%` }} />
                    <span className="num is-pos">+{(s.v * 100).toFixed(0)}</span>
                  </>
                ) : (
                  <>
                    <span className="fill is-neg" style={{ width: `${Math.min(50, Math.abs(s.v) * 130)}%` }} />
                    <span className="num is-neg">{(s.v * 100).toFixed(0)}</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink-2)' }}>
          {plainEnglish ? (
            <>
              <p style={{ fontWeight: 600, color: 'var(--ink)' }}>{plainEnglish}</p>
              {riskFactors && riskFactors.length > 0 && (
                <>
                  <div style={{
                    font: "700 11px/1 'Manrope'", letterSpacing: '.16em',
                    textTransform: 'uppercase', color: 'var(--ink-3)',
                    marginTop: 14, marginBottom: 8,
                  }}>
                    Contributing factors
                  </div>
                  <ul style={{ paddingLeft: 18, margin: 0 }}>
                    {riskFactors.slice(0, 6).map((f, i) => (
                      <li key={i} style={{ marginBottom: 4 }}>
                        {f.replace(/^\+\s*/, '').replace(/\s*\(impact:[^)]+\)$/, '')}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <p style={{ marginTop: 14, fontSize: 12, color: 'var(--ink-4)' }}>
                Generated from SHAP factors by <code>dashboard/components/plain_english.py</code>.
              </p>
            </>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              Plain-English narrative will appear once the backend returns it for this case.
            </div>
          )}
        </div>
      )}

      <div className="shap__fatf">
        <div style={{ font: "700 11px/1 'Manrope'", letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 6 }}>
          FATF rules triggered{rules.length > 0 ? ` · ${rules.length}` : ''}
        </div>
        {rules.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>No FATF rules attached.</div>
        ) : rules.map(r => (
          <div key={r.code} className="ftab">
            <span className="num">{r.code.split('-')[1] ?? r.code}</span>
            <div className="body"><b>{r.title}</b><span>{r.note}</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}
