'use client';

import { useState } from 'react';
import { SHAP_FEATURES, WORKSPACE_CASE } from '@/lib/workspace-data';

type ShapView = 'chart' | 'text';

export interface ShapPanelProps {
  /** Plain-English summary from the API (overrides the canned text). */
  plainEnglish?: string;
  /** Real SHAP factors from the API for the side-panel info. */
  riskFactors?: string[];
}

export function ShapPanel({ plainEnglish, riskFactors }: ShapPanelProps = {}) {
  const [view, setView] = useState<ShapView>('chart');

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
        <span className="n">94</span>
        <span className="of">/ 100</span>
        <span className="delta">▲ +52 vs. base</span>
      </div>

      {view === 'chart' ? (
        <div className="shap__bars">
          <div style={{ display: 'flex', justifyContent: 'space-between', font: "600 10px/1 'Manrope'", letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
            <span>Pushes away ←</span>
            <span>→ Pushes toward fraud</span>
          </div>
          {SHAP_FEATURES.map((s, i) => (
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
          <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 4 }}>
            Base value · 0.42 (prior fraud probability for this account cohort).
          </div>
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
            <>
              <p>The model is highly confident this account is laundering funds. The strongest signal is a <b>coordinated burst transfer</b> of 12 transactions in a 4-hour window, all just below the ₹50 000 reporting threshold (structuring).</p>
              <p>Network features compound this: the account is two hops from <b>mule cluster S-19</b>, a previously confirmed laundering ring, via GAT-detected proximity (0.74).</p>
              <p>Temporal features reinforce: the account had been <b>dormant for 217 days</b> and was reactivated only 21 hours before the burst — a textbook activation pattern.</p>
            </>
          )}
        </div>
      )}

      <div>
        <div style={{ font: "700 11px/1 'Manrope'", letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 10 }}>
          Temporal & graph features
        </div>
        <div className="shap__features">
          <div className="shap__feature is-alert"><div className="k">Burst score</div><div className="v">0.91 <small>/ 1.00</small></div></div>
          <div className="shap__feature is-alert"><div className="k">Velocity · 1h</div><div className="v">12 <small>tx</small></div></div>
          <div className="shap__feature"><div className="k">Dormancy</div><div className="v">217 <small>days</small></div></div>
          <div className="shap__feature"><div className="k">Layering depth</div><div className="v">6 <small>hops</small></div></div>
          <div className="shap__feature is-alert"><div className="k">PageRank</div><div className="v">0.084</div></div>
          <div className="shap__feature"><div className="k">Flagged neighbours</div><div className="v">4</div></div>
        </div>
      </div>

      <div className="shap__fatf">
        <div style={{ font: "700 11px/1 'Manrope'", letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 6 }}>
          FATF rules triggered
        </div>
        {WORKSPACE_CASE.fatfRules.map(r => (
          <div key={r.code} className="ftab">
            <span className="num">{r.code.split('-')[1]}</span>
            <div className="body"><b>{r.title}</b><span>{r.note}</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}
