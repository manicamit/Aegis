'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Topbar } from '@/components/nav/Topbar';
import { Icon } from '@/components/shared/Icon';

type Phase = 'idle' | 'uploading' | 'running' | 'completed' | 'failed';

const STAGES = [
  'Ingest CSV',
  'Build Graph',
  'Rules & Features',
  'Train GAT',
  'Train LightGBM',
  'Build Cases',
];

const EXPECTED_COLUMNS = [
  'Timestamp',
  'From Bank',
  'Account',
  'To Bank',
  'Account.1',
  'Amount Paid',
  'Payment Currency',
  'Is Laundering',
];

function fmtSize(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export default function TrainView() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    const f = files[0];
    if (!f.name.toLowerCase().endsWith('.csv')) {
      setError('Please select a .csv file.');
      return;
    }
    setFile(f);
    setError(null);
  }, []);

  const handleUpload = useCallback(async () => {
    if (!file) return;
    setPhase('uploading');
    setError(null);
    setLogs([]);
    setStage(0);

    const form = new FormData();
    form.append('file', file);

    try {
      const res = await fetch('/api/pipeline/upload', { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok) {
        setError(json.detail || json.error || 'Upload failed');
        setPhase('idle');
        return;
      }
      setRunId(json.run_id);
      setPhase('running');
    } catch {
      setError('Network error — is the backend running?');
      setPhase('idle');
    }
  }, [file]);

  const cursorRef = useRef(0);

  useEffect(() => {
    if (phase !== 'running' || !runId) return;
    cursorRef.current = 0;
    let cancelled = false;

    const poll = async () => {
      while (!cancelled) {
        try {
          const res = await fetch(
            `/api/pipeline/status/${runId}?cursor=${cursorRef.current}`,
            { cache: 'no-store' },
          );
          if (!res.ok) break;
          const data = await res.json();

          if (!cancelled) {
            if (data.logs && data.logs.length > 0) {
              setLogs(prev => [...prev, ...data.logs]);
              cursorRef.current = data.next_cursor;
            }
            setStage(data.stage);

            if (data.status === 'completed') {
              setStage(7);
              setPhase('completed');
              break;
            }
            if (data.status === 'failed') {
              setError(data.error || 'Pipeline failed');
              setPhase('failed');
              break;
            }
          }
        } catch {
          // transient network error, keep polling
        }
        await new Promise(r => setTimeout(r, 500));
      }
    };

    void poll();
    return () => { cancelled = true; };
  }, [phase, runId]);

  const reset = useCallback(() => {
    setPhase('idle');
    setFile(null);
    setRunId(null);
    setLogs([]);
    setStage(0);
    setError(null);
  }, []);

  return (
    <>
      <Topbar
        title="Upload & Train"
        subtitle="Upload a transaction dataset and train the full AEGIS pipeline."
        breadcrumbs={[
          { label: 'Home', href: '/alerts' },
          { label: 'Admin' },
          { label: 'Upload & Train' },
        ]}
      >
        <span className="tag is-warn">Admin only</span>
      </Topbar>

      <div className="page__body">
        {/* ── Upload Zone ──────────────────────────────────────────── */}
        {(phase === 'idle' || phase === 'uploading') && (
          <div className="q-table">
            <div className="s-card__head">
              <div>
                <h3>Upload Transaction Dataset</h3>
                <p>
                  Upload a CSV file with transaction data. The pipeline will ingest, build a graph,
                  train models (GAT + LightGBM), and generate investigation cases.
                </p>
              </div>
            </div>

            <div style={{ padding: '20px 24px' }}>
              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${dragOver ? 'var(--brand)' : 'var(--line-strong)'}`,
                  borderRadius: 12,
                  padding: '36px 20px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: dragOver ? 'var(--brand-soft)' : 'var(--bg-canvas)',
                  transition: 'all .15s',
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  style={{ display: 'none' }}
                  onChange={e => handleFiles(e.target.files)}
                />
                <div style={{ marginBottom: 10, color: 'var(--ink-3)' }}>
                  <Icon name="export" size={28} />
                </div>
                {file ? (
                  <div>
                    <div style={{ font: "600 14px/1 'Manrope'", color: 'var(--ink)' }}>
                      {file.name}
                    </div>
                    <div style={{ font: "500 12px/1 'Manrope'", color: 'var(--ink-3)', marginTop: 6 }}>
                      {fmtSize(file.size)}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ font: "600 13px/1 'Manrope'", color: 'var(--ink-2)' }}>
                      Drop a CSV file here or click to browse
                    </div>
                    <div style={{ font: "500 11.5px/1 'Manrope'", color: 'var(--ink-4)', marginTop: 6 }}>
                      Maximum 100 MB
                    </div>
                  </div>
                )}
              </div>

              {/* Expected columns table */}
              <div style={{ marginTop: 20 }}>
                <div style={{ font: "600 12px/1 'Manrope'", color: 'var(--ink-3)', marginBottom: 8, letterSpacing: '.04em' }}>
                  EXPECTED CSV COLUMNS
                </div>
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                }}>
                  {EXPECTED_COLUMNS.map(col => (
                    <span
                      key={col}
                      style={{
                        font: "600 11px/1 'JetBrains Mono'",
                        padding: '5px 10px',
                        background: 'var(--bg-canvas)',
                        border: '1px solid var(--line)',
                        borderRadius: 6,
                        color: 'var(--ink-2)',
                      }}
                    >
                      {col}
                    </span>
                  ))}
                </div>
              </div>

              {error && (
                <div style={{
                  marginTop: 16,
                  padding: '10px 14px',
                  background: 'var(--danger-soft)',
                  color: '#b53848',
                  borderRadius: 8,
                  font: "600 12.5px/1.4 'Manrope'",
                  whiteSpace: 'pre-wrap',
                }}>
                  {error}
                </div>
              )}

              <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
                <button
                  className="btn btn--primary"
                  disabled={!file || phase === 'uploading'}
                  onClick={() => void handleUpload()}
                  style={{ padding: '10px 24px', borderRadius: 8, font: "700 13px/1 'Manrope'" }}
                >
                  {phase === 'uploading' ? 'Uploading...' : 'Start Training'}
                </button>
                {file && phase !== 'uploading' && (
                  <button
                    className="btn btn--ghost"
                    onClick={() => { setFile(null); setError(null); }}
                    style={{ padding: '10px 16px', borderRadius: 8 }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Progress Stepper ─────────────────────────────────────── */}
        {(phase === 'running' || phase === 'completed' || phase === 'failed') && (
          <div className="q-table" style={{ padding: '20px 24px' }}>
            <div style={{
              font: "600 12px/1 'Manrope'",
              color: 'var(--ink-3)',
              marginBottom: 16,
              letterSpacing: '.04em',
              textTransform: 'uppercase',
            }}>
              Pipeline Progress
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
              {STAGES.map((label, i) => {
                const stageNum = i + 1;
                const isCompleted = stage > stageNum;
                const isActive = stage === stageNum;
                const isFailed = phase === 'failed' && isActive;
                return (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          display: 'grid',
                          placeItems: 'center',
                          fontSize: 11,
                          fontWeight: 700,
                          fontFamily: "'JetBrains Mono'",
                          background: isCompleted
                            ? 'var(--approved)'
                            : isFailed
                              ? 'var(--danger)'
                              : isActive
                                ? 'var(--brand)'
                                : 'var(--line)',
                          color: isCompleted || isActive || isFailed ? '#fff' : 'var(--ink-4)',
                          transition: 'all .3s',
                          ...(isActive && !isFailed ? { animation: 'pulse 1.5s infinite' } : {}),
                        }}
                      >
                        {isCompleted ? <Icon name="check" size={14} /> : stageNum}
                      </div>
                      <span style={{
                        font: "600 10.5px/1 'Manrope'",
                        color: isCompleted ? 'var(--approved)' : isActive ? 'var(--ink)' : 'var(--ink-4)',
                        textAlign: 'center',
                        whiteSpace: 'nowrap',
                      }}>
                        {label}
                      </span>
                    </div>
                    {i < STAGES.length - 1 && (
                      <div style={{
                        flex: 1,
                        height: 2,
                        background: isCompleted ? 'var(--approved)' : 'var(--line)',
                        margin: '0 6px',
                        marginBottom: 20,
                        transition: 'background .3s',
                      }} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Log Viewer ───────────────────────────────────────────── */}
        {(phase === 'running' || phase === 'completed' || phase === 'failed') && (
          <div className="q-table" style={{ background: '#1a1e2e' }}>
            <div style={{
              padding: '12px 16px',
              borderBottom: '1px solid rgba(255,255,255,.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <span style={{ font: "600 12px/1 'JetBrains Mono'", color: 'rgba(255,255,255,.5)', letterSpacing: '.06em' }}>
                PIPELINE LOGS
              </span>
              {phase === 'running' && (
                <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'var(--approved)',
                  animation: 'pulse 1.5s infinite',
                }} />
              )}
            </div>
            <div
              style={{
                maxHeight: 400,
                overflowY: 'auto',
                padding: '12px 16px',
                font: "400 12px/1.6 'JetBrains Mono'",
                color: 'rgba(255,255,255,.8)',
              }}
            >
              {logs.length === 0 && (
                <div style={{ color: 'rgba(255,255,255,.3)' }}>Waiting for logs...</div>
              )}
              {logs.map((line, i) => (
                <div key={i} style={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  ...(line.includes('[ERROR]') ? { color: '#f47067' } : {}),
                  ...(line.includes('[WARNING]') ? { color: '#d4a418' } : {}),
                  ...(line.includes('===') ? { color: '#7ee0cf', fontWeight: 700 } : {}),
                }}>
                  {line}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        )}

        {/* ── Completion Banner ─────────────────────────────────────── */}
        {phase === 'completed' && (
          <div style={{
            padding: '20px 24px',
            background: 'var(--approved-soft)',
            borderRadius: 'var(--r-card)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: 'var(--approved)',
                display: 'grid',
                placeItems: 'center',
                color: '#fff',
              }}>
                <Icon name="check" size={20} />
              </div>
              <div>
                <div style={{ font: "700 15px/1 'Manrope'", color: '#1a7d52' }}>
                  Pipeline Complete
                </div>
                <div style={{ font: "500 12.5px/1 'Manrope'", color: '#1a7d52', marginTop: 4, opacity: 0.8 }}>
                  Models trained and cases generated. View them in the Alert Queue.
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="btn btn--primary"
                onClick={() => router.push('/alerts')}
                style={{ padding: '10px 20px', borderRadius: 8, font: "700 13px/1 'Manrope'" }}
              >
                View Cases
              </button>
              <button
                className="btn btn--ghost"
                onClick={reset}
                style={{ padding: '10px 16px', borderRadius: 8 }}
              >
                Train Again
              </button>
            </div>
          </div>
        )}

        {/* ── Error Banner ──────────────────────────────────────────── */}
        {phase === 'failed' && (
          <div style={{
            padding: '20px 24px',
            background: 'var(--danger-soft)',
            borderRadius: 'var(--r-card)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: 'var(--danger)',
                display: 'grid',
                placeItems: 'center',
                color: '#fff',
                flexShrink: 0,
              }}>
                <Icon name="alert" size={20} />
              </div>
              <div>
                <div style={{ font: "700 15px/1 'Manrope'", color: '#b53848' }}>
                  Pipeline Failed
                </div>
                <div style={{ font: "500 12.5px/1 'Manrope'", color: '#b53848', marginTop: 4, opacity: 0.8 }}>
                  Check the logs above for details.
                </div>
              </div>
            </div>
            {error && (
              <pre style={{
                font: "400 11px/1.5 'JetBrains Mono'",
                color: '#b53848',
                background: 'rgba(181,56,72,.08)',
                padding: '10px 12px',
                borderRadius: 8,
                overflow: 'auto',
                maxHeight: 200,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                margin: '0 0 12px',
              }}>
                {error}
              </pre>
            )}
            <button
              className="btn btn--ghost"
              onClick={reset}
              style={{ padding: '10px 20px', borderRadius: 8, color: '#b53848', borderColor: 'rgba(181,56,72,.3)' }}
            >
              Try Again
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </>
  );
}
