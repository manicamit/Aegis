'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Icon } from '@/components/shared/Icon';
import { setSession, ROLE_REDIRECTS } from '@/lib/auth';
import type { UserRole } from '@/types/aegis';
import { Suspense } from 'react';

const ROLES: { id: UserRole; label: string; desc: string }[] = [
  { id: 'investigator', label: 'Investigator', desc: 'Triage · file STRs · export cases' },
  { id: 'analyst',      label: 'Analyst',      desc: 'View-only · graphs · metrics' },
  { id: 'admin',        label: 'Admin',         desc: 'Full access · users · audit · escalations' },
];

const ROLE_GREETINGS: Record<UserRole, string> = {
  investigator: 'Welcome back, investigator.',
  analyst:      'Welcome back, analyst.',
  admin:        'Welcome back, admin.',
};

function LoginForm() {
  const [u, setU]               = useState('');
  const [p, setP]               = useState('');
  const [role, setRole]         = useState<UserRole>('investigator');
  const [remember, setRemember] = useState(true);
  const [err, setErr]           = useState<string | null>(null);
  const [busy, setBusy]         = useState(false);

  const router       = useRouter();
  const searchParams = useSearchParams();
  const expired      = searchParams.get('expired') === '1';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!u || !p) { setErr('Enter both username and password to continue.'); return; }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p }),
      });
      const json = await res.json();
      if (!res.ok) { setErr(json.error ?? 'Invalid credentials. Try again.'); return; }
      const serverRole = json.role as UserRole;
      setSession(serverRole);
      router.push(ROLE_REDIRECTS[serverRole]);
    } catch {
      setErr('Network error — is the server running?');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-shell">
      <div className="login-art">
        <div className="login-art__chip"><i />FIU-IND · NIST AI RMF</div>
        <div className="login-art__brand">
          <span className="mark"><Icon name="shield" size={22} /></span>
          AEGIS
        </div>
        <div className="login-art__copy">
          <div className="login-art__eyebrow">Anti-money-laundering platform</div>
          <h2>Stop the laundering chain before the next hop.</h2>
          <p>
            Graph-native investigation, SHAP-explainable risk, and one-click
            STR narratives — built for India&apos;s compliance teams and the
            cases that don&apos;t fit a rule.
          </p>
          <div className="login-art__meta">
            <div><div className="kpi">9.4×</div><div className="lbl">Fewer false positives</div></div>
            <div><div className="kpi">2.1s</div><div className="lbl">Avg. STR draft time</div></div>
            <div><div className="kpi">5.0M</div><div className="lbl">Tx benchmarked</div></div>
          </div>
        </div>
      </div>

      <form className="login-card" onSubmit={submit}>
        <h3>{ROLE_GREETINGS[role]}</h3>
        <p className="sub">Sign in with your AEGIS credentials to begin triage.</p>

        {expired && (
          <div className="login-error" style={{ background: 'var(--warn-soft)', borderColor: '#f0d9a8', color: '#a96b16' }}>
            <Icon name="bell" size={16} /> Your session expired. Please sign in again.
          </div>
        )}

        {err && (
          <div className="login-error">
            <Icon name="alert" size={16} /> {err}
          </div>
        )}

        <div className="login-field">
          <label>Sign in as</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
            {ROLES.map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRole(r.id)}
                style={{
                  padding: '10px 8px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                  border: role === r.id ? '2px solid var(--brand)' : '1.5px solid var(--line-strong)',
                  background: role === r.id ? 'var(--brand-soft)' : '#fff',
                  transition: 'border .12s, background .12s',
                }}
              >
                <div style={{ font: "700 12px/1 'Manrope'", color: role === r.id ? 'var(--brand-2)' : 'var(--ink)', marginBottom: 4 }}>
                  {r.label}
                </div>
                <div style={{ font: "500 10px/1.3 'Manrope'", color: 'var(--ink-4)' }}>{r.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="login-field">
          <label>Username</label>
          <div className="input">
            <span className="ic"><Icon name="user" size={16} /></span>
            <input value={u} onChange={e => setU(e.target.value)} placeholder="agent.smith" autoComplete="username" />
          </div>
        </div>

        <div className="login-field">
          <label>Password</label>
          <div className="input">
            <span className="ic"><Icon name="shield" size={16} /></span>
            <input type="password" value={p} onChange={e => setP(e.target.value)} placeholder="••••••••••••" autoComplete="current-password" />
          </div>
        </div>

        <div className="login-row">
          <span className={'cb ' + (remember ? 'on' : '')} onClick={() => setRemember(!remember)}>
            <i>{remember && <Icon name="check" size={12} />}</i>
            Keep me signed in for 8 hours
          </span>
          <a href="#">Need access?</a>
        </div>

        <button className="btn btn--brand btn--lg" type="submit" disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>
          {busy ? 'Verifying…' : `Sign in as ${ROLES.find(r => r.id === role)!.label}`}
        </button>

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 2 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            font: "700 10px/1 'Manrope'", letterSpacing: '.14em', textTransform: 'uppercase',
            color: role === 'admin' ? 'var(--brand-2)' : 'var(--ink-4)',
            background: role === 'admin' ? 'var(--brand-soft)' : '#f5f6fb',
            padding: '5px 10px', borderRadius: 20,
          }}>
            <Icon name="shield" size={10} />
            {role === 'admin' ? 'Admin · MFA required on first login' : `Role: ${role}`}
          </span>
        </div>

        <div className="login-foot">
          <span>JWT · role-based access · hash-chained audit</span>
          <span className="ver">v 2.4.1 — May 25 2026</span>
        </div>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
