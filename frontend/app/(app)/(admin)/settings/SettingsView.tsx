'use client';

import { useState } from 'react';
import { Topbar } from '@/components/nav/Topbar';
import { Icon } from '@/components/shared/Icon';
import type {
  AdminApiKey,
  AdminApiKeysResponse,
  AdminConfigResponse,
  AdminPermissionsResponse,
  AdminUsersResponse,
} from '@/lib/admin-shared';
import { formatTimestamp, type AuditTrailResponse } from '@/lib/audit-shared';

type TabId = 'users' | 'perms' | 'api' | 'system' | 'audit';

interface Props {
  data: {
    users:       AdminUsersResponse;
    permissions: AdminPermissionsResponse;
    apiKeys:     AdminApiKeysResponse;
    config:      AdminConfigResponse;
    audit:       AuditTrailResponse;
  };
}

function relativeTime(ts: number | null): string {
  if (!ts) return 'never';
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return `${Math.floor(diff)} sec ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return `${Math.floor(diff / 86400)} d ago`;
}

export function SettingsView({ data }: Props) {
  const [tab, setTab] = useState<TabId>('users');

  const TABS: { id: TabId; label: string; icon: string; ct?: number }[] = [
    { id: 'users',  label: 'Users',                icon: 'user',   ct: data.users.total },
    { id: 'perms',  label: 'Roles & permissions',  icon: 'shield', ct: data.permissions.roles.length },
    { id: 'api',    label: 'API keys',             icon: 'case',   ct: data.apiKeys.total },
    { id: 'system', label: 'System',               icon: 'cog' },
    { id: 'audit',  label: 'Audit log',            icon: 'chart',  ct: data.audit.integrity.total_entries },
  ];

  return (
    <>
      <Topbar
        title="Settings & User Management"
        subtitle="Admin controls for users, roles, API keys, and audit history."
        breadcrumbs={[{ label: 'Home', href: '/alerts' }, { label: 'Settings' }]}
      >
        <span className="tag is-warn">Admin only</span>
      </Topbar>

      <div className="page__body">
        <div className="settings">
          <nav className="settings-nav">
            {TABS.map(t => (
              <button key={t.id} className={tab === t.id ? 'is-on' : ''} onClick={() => setTab(t.id)}>
                <Icon name={t.icon} size={16} />
                {t.label}
                {t.ct != null && <span className="ct">{t.ct.toLocaleString()}</span>}
              </button>
            ))}
          </nav>

          <div>
            {tab === 'users'  && <UsersPanel data={data.users} />}
            {tab === 'perms'  && <PermsPanel data={data.permissions} />}
            {tab === 'api'    && <ApiPanel initial={data.apiKeys} />}
            {tab === 'system' && <SystemPanel data={data.config} />}
            {tab === 'audit'  && <AuditPanel data={data.audit} />}
          </div>
        </div>
      </div>
    </>
  );
}

function UsersPanel({ data }: { data: AdminUsersResponse }) {
  return (
    <div className="s-card">
      <div className="head">
        <div>
          <h2>All users</h2>
          <p>{data.total} active · {data.suspended} suspended · {data.invited} invitations pending</p>
        </div>
        <button className="btn btn--brand"><Icon name="plus" size={14} /> Invite user</button>
      </div>
      <div>
        <div className="user-row is-head">
          <span />
          <span>Name</span>
          <span>Role</span>
          <span>Last login</span>
          <span>Status</span>
          <span style={{ textAlign: 'right' }}>Actions</span>
        </div>
        {data.rows.length === 0 && (
          <div style={{ padding: 24, color: 'var(--ink-3)', font: "600 13px/1 'Manrope'" }}>
            No users returned by /api/v1/admin/users.
          </div>
        )}
        {data.rows.map(u => (
          <div key={u.username} className="user-row">
            <div className="av">{u.initials}</div>
            <div className="name">
              <b>{u.name}</b>
              <span>{u.email}</span>
            </div>
            <div><span className={'role r-' + u.role}>{u.role}</span></div>
            <div style={{ color: 'var(--ink-2)' }}>{relativeTime(u.last_login)}</div>
            <div>
              <span className={'status ' + (u.status === 'suspended' ? 'is-off' : '')}>
                {u.status === 'suspended' ? 'Suspended' : 'Active'}
              </span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <button className="icon-btn" title="Change role"><Icon name="cog" size={14} /></button>
              <button className="icon-btn" style={{ marginLeft: 4 }} title="More"><Icon name="dots" size={14} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PermsPanel({ data }: { data: AdminPermissionsResponse }) {
  return (
    <div className="s-card">
      <div className="head">
        <div>
          <h2>Roles & permissions</h2>
          <p>{data.note}</p>
        </div>
      </div>
      <table className="perm-table">
        <thead>
          <tr>
            <th>Capability</th>
            {data.roles.map(r => (
              <th key={r} style={{ textTransform: 'capitalize' }}>{r.replace('_', ' ')}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map(r => (
            <tr key={r.id}>
              <td>{r.label}</td>
              {data.roles.map(role => {
                const has = (r as unknown as Record<string, boolean>)[role];
                return <td key={role} className={has ? 'y' : 'n'}>{has ? '✓' : '—'}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ApiPanel({ initial }: { initial: AdminApiKeysResponse }) {
  const [rows, setRows]         = useState<AdminApiKey[]>(initial.rows);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey]     = useState<{ label: string; plaintext: string } | null>(null);
  const [busyId, setBusyId]     = useState<string | null>(null);
  const [error, setError]       = useState<string | null>(null);

  const createKey = async () => {
    const label = prompt('Label for new API key:');
    if (!label) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const created = await res.json();
      setNewKey({ label, plaintext: created.plaintext });
      const refreshed = await fetch('/api/admin/api-keys', { credentials: 'include' }).then(r => r.json());
      setRows((refreshed as AdminApiKeysResponse).rows);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (id: string) => {
    if (!confirm('Revoke this API key? This cannot be undone.')) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/api-keys/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRows(prev => prev.filter(r => r.id !== id));
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="s-card">
      <div className="head">
        <div>
          <h2>API keys</h2>
          <p>Key values are shown once at creation, then only the hash is stored.</p>
        </div>
        <button className="btn btn--brand" onClick={createKey} disabled={creating}>
          <Icon name="plus" size={14} /> {creating ? 'Generating…' : 'Generate key'}
        </button>
      </div>

      {newKey && (
        <div style={{
          marginBottom: 12, padding: '12px 14px', background: 'var(--warn-soft)',
          border: '1px solid var(--warn)', borderRadius: 8, fontSize: 13,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Copy now — shown once</div>
          <code style={{ fontFamily: "'JetBrains Mono'", fontSize: 12, wordBreak: 'break-all' }}>
            {newKey.plaintext}
          </code>
          <button className="btn btn--ghost btn--sm" style={{ marginLeft: 8 }} onClick={() => setNewKey(null)}>
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div style={{ padding: 10, color: 'var(--danger)', fontSize: 12, marginBottom: 8 }}>
          {error}
        </div>
      )}

      <div>
        <div className="api-row is-head">
          <span>Label</span>
          <span>Hash</span>
          <span>Created</span>
          <span>Last used</span>
          <span style={{ textAlign: 'right' }}>Actions</span>
        </div>
        {rows.length === 0 && (
          <div style={{ padding: 24, color: 'var(--ink-3)', font: "600 13px/1 'Manrope'" }}>
            No API keys provisioned yet.
          </div>
        )}
        {rows.map(k => (
          <div key={k.id} className="api-row">
            <div className="label"><b>{k.label}</b><span>scope · {k.scope}</span></div>
            <div className="mono">{k.hash_short}</div>
            <div className="when">{formatTimestamp(k.created_at).date}</div>
            <div className="when">{relativeTime(k.last_used)}</div>
            <div style={{ textAlign: 'right' }}>
              <button className="btn btn--ghost btn--sm" disabled>Rotate</button>
              <button
                className="btn btn--ghost btn--sm"
                style={{ marginLeft: 6, color: 'var(--danger)', borderColor: 'var(--danger-soft)' }}
                disabled={busyId === k.id}
                onClick={() => revoke(k.id)}
              >
                {busyId === k.id ? 'Revoking…' : 'Revoke'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SystemPanel({ data }: { data: AdminConfigResponse }) {
  return (
    <div>
      <div className="s-card">
        <div className="head"><div><h2>Rate limiting</h2><p>API throttles enforced per-key.</p></div></div>
        <ConfigRow label="Requests per minute"       value={data.rate_limiting.requests_per_minute} note={`Burst ${data.rate_limiting.burst}`} />
        <ConfigRow label="Concurrent investigations" value={data.rate_limiting.concurrent_investigations} note="per investigator" />
        <ConfigRow label="STR generations / hour"    value={data.rate_limiting.str_per_hour} note="per investigator" />
      </div>
      <div className="s-card">
        <div className="head"><div><h2>Session</h2><p>JWT validity and refresh policy.</p></div></div>
        <ConfigRow label="JWT expiry"   value={`${data.session.jwt_expiry_minutes} min`}     note="Hard logout after expiry" />
        <ConfigRow label="Idle timeout" value={`${data.session.idle_timeout_minutes} min`}   note="Re-auth required" />
        <ConfigRow label="MFA"          value={`Required for ${data.session.mfa_required_for}`} />
      </div>
      <div className="s-card">
        <div className="head"><div><h2>Paths</h2><p>Operational file locations on the FIU-IND tenant.</p></div></div>
        <ConfigRow label="Audit log path"  value={data.paths.audit_log}      mono />
        <ConfigRow label="Model directory" value={data.paths.model_dir}      mono />
        <ConfigRow label="Data directory"  value={data.paths.data_dir}       mono />
        <ConfigRow label="Pending alerts"  value={data.paths.pending_alerts} mono />
        <ConfigRow label="API key store"   value={data.paths.api_keys}       mono />
      </div>
      <div className="s-card">
        <div className="head"><div><h2>Auto-escalation</h2><p>Timeouts and webhook for SLA misses.</p></div></div>
        <ConfigRow label="Timeout"  value={`${Math.round(data.escalation.timeout_seconds / 60)} min`} />
        <ConfigRow label="Tick"     value={`${data.escalation.tick_seconds}s`} />
        <ConfigRow label="Webhook"  value={data.escalation.webhook_url || '— not configured —'} mono />
      </div>
    </div>
  );
}

interface ConfigRowProps { label: string; value: string; note?: string; mono?: boolean }

function ConfigRow({ label, value, note, mono }: ConfigRowProps) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr auto auto',
      gap: 14, alignItems: 'center',
      padding: '12px 0', borderBottom: '1px solid var(--line)',
    }}>
      <div>
        <div style={{ font: "600 13px/1 'Manrope'", color: 'var(--ink)' }}>{label}</div>
        {note && <div style={{ font: "500 11px/1.4 'Manrope'", color: 'var(--ink-3)', marginTop: 3 }}>{note}</div>}
      </div>
      <div style={{
        font: mono ? "600 12px/1 'JetBrains Mono'" : "700 13px/1 'Space Grotesk'",
        color: 'var(--ink)',
        background: '#f1f3fa', padding: '6px 10px', borderRadius: 7,
      }}>
        {value}
      </div>
      <button className="btn btn--ghost btn--sm" disabled>Edit</button>
    </div>
  );
}

function AuditPanel({ data }: { data: AuditTrailResponse }) {
  return (
    <div className="s-card">
      <div className="head">
        <div>
          <h2>Audit log <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 12, color: 'var(--ink-3)', fontWeight: 600 }}>· hash-chained</span></h2>
          <p>
            Showing {data.rows.length} of {data.integrity.total_entries.toLocaleString()} entries ·
            chain head <code>
              {data.integrity.head_hash
                ? `blk#${data.integrity.total_entries} · prev ${data.integrity.head_prev?.slice(0, 8) ?? '—'}…`
                : '—'}
            </code>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn--ghost"><Icon name="search" size={14} /> Search</button>
          <button className="btn btn--ghost"><Icon name="export" size={14} /> Export</button>
        </div>
      </div>
      <div
        className="audit-row"
        style={{ background: '#fafbff', paddingLeft: 8, paddingRight: 8, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.14em', fontSize: 10, fontFamily: 'Manrope' }}
      >
        <span>Timestamp</span><span>Event</span><span>Actor</span><span>Detail</span>
      </div>
      <div className="audit-log">
        {data.rows.length === 0 && (
          <div style={{ padding: 24, color: 'var(--ink-3)', font: "600 13px/1 'Manrope'" }}>
            Audit log is empty.
          </div>
        )}
        {data.rows.map(r => {
          const { date, time } = formatTimestamp(r.timestamp);
          return (
            <div key={r.id} className="audit-row">
              <span className="ts">{date} {time}</span>
              <span className="evt">{r.event}</span>
              <span className="who">{r.actor}</span>
              <span>{r.description}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
