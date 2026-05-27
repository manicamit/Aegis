'use client';

import { useState } from 'react';
import { Topbar } from '@/components/nav/Topbar';
import { Icon } from '@/components/shared/Icon';

interface User { name: string; email: string; role: 'investigator' | 'analyst' | 'admin'; last: string; status: 'active' | 'off'; id: string }

const USERS: User[] = [
  { name: 'Agent Smith',        email: 'a.smith@aegis.fiu',       role: 'investigator', last: '9 min ago',    status: 'active', id: 'AS' },
  { name: 'Priya Ranganathan',  email: 'p.ranganathan@aegis.fiu', role: 'investigator', last: '2 h ago',      status: 'active', id: 'PR' },
  { name: 'Manager Lee',        email: 'm.lee@aegis.fiu',         role: 'admin',        last: '21 min ago',   status: 'active', id: 'ML' },
  { name: 'Vikram Sethi',       email: 'v.sethi@aegis.fiu',       role: 'analyst',      last: '4 h ago',      status: 'active', id: 'VS' },
  { name: 'Nisha Patel',        email: 'n.patel@aegis.fiu',       role: 'analyst',      last: 'yesterday',    status: 'active', id: 'NP' },
  { name: 'Test User 042',      email: 'test042@aegis.fiu',       role: 'investigator', last: '27 days ago',  status: 'off',    id: 'T4' },
];

interface Perm { row: string; analyst: 'y' | 'n'; investigator: 'y' | 'n'; admin: 'y' | 'n' }

const PERMS: Perm[] = [
  { row: 'View alert queue',         analyst: 'y', investigator: 'y', admin: 'y' },
  { row: 'Open case workspace',      analyst: 'y', investigator: 'y', admin: 'y' },
  { row: 'Run risk propagation',     analyst: 'y', investigator: 'y', admin: 'y' },
  { row: 'Assign / claim alerts',    analyst: 'n', investigator: 'y', admin: 'y' },
  { row: 'Change alert status',      analyst: 'n', investigator: 'y', admin: 'y' },
  { row: 'Generate STR narrative',   analyst: 'n', investigator: 'y', admin: 'y' },
  { row: 'Export case dossier',      analyst: 'n', investigator: 'y', admin: 'y' },
  { row: 'Bulk close / escalate',    analyst: 'n', investigator: 'y', admin: 'y' },
  { row: 'Manage users',             analyst: 'n', investigator: 'n', admin: 'y' },
  { row: 'Manage API keys',          analyst: 'n', investigator: 'n', admin: 'y' },
  { row: 'View audit log',           analyst: 'n', investigator: 'n', admin: 'y' },
  { row: 'Open benchmark notebook',  analyst: 'n', investigator: 'n', admin: 'y' },
];

interface ApiKey { label: string; created: string; lastUsed: string; hash: string }

const APIKEYS: ApiKey[] = [
  { label: 'Core ingestion',        created: '12 Apr 2026', lastUsed: '9 min ago',  hash: 'ak_7r6z…f3a9' },
  { label: 'FIU-IND submitter',     created: '01 Feb 2026', lastUsed: '32 min ago', hash: 'ak_2c1m…0b41' },
  { label: 'Reporting BI exporter', created: '29 Dec 2025', lastUsed: '4 h ago',    hash: 'ak_88kp…ee12' },
  { label: 'Sandbox · staging',     created: '03 Mar 2026', lastUsed: 'yesterday',  hash: 'ak_91qn…7d80' },
];

const AUDIT: [string, string, string, string][] = [
  ['2026-05-25 09:14:08', 'STR_EXPORTED',        'Agent Smith', 'case=AGS-2027H · fmt=pdf · hash=blk#41209'],
  ['2026-05-25 09:11:33', 'STR_GENERATED',       'Agent Smith', 'case=AGS-2027H · model=claude-3-5 · words=1840'],
  ['2026-05-25 09:08:01', 'CASE_STATUS_CHANGED', 'Agent Smith', 'AGS-2027H · new → in-review'],
  ['2026-05-25 08:55:21', 'LOGIN_SUCCESS',       'Agent Smith', 'ip=203.0.113.84 · device=0xA94CF · jwt=…0291'],
  ['2026-05-25 08:54:48', 'MODEL_RETRAIN_SCHED', 'System',      'next=2026-06-09T03:00Z · drift=0.034'],
  ['2026-05-25 08:32:11', 'BULK_CLOSE',          'Manager Lee', 'n=14 · reason=duplicate_of_AGS-2027F'],
  ['2026-05-25 08:14:47', 'API_KEY_CREATED',     'Manager Lee', "label='Sandbox · staging' · hash=ak_91qn…7d80"],
  ['2026-05-24 22:01:09', 'LOGIN_FAIL',          'test042',     'ip=10.4.21.6 · reason=password · attempt=3'],
];

type TabId = 'users' | 'perms' | 'api' | 'system' | 'audit';

const TABS: { id: TabId; label: string; icon: string; ct?: number }[] = [
  { id: 'users',  label: 'Users',                icon: 'user',   ct: USERS.length },
  { id: 'perms',  label: 'Roles & permissions',  icon: 'shield', ct: 3 },
  { id: 'api',    label: 'API keys',             icon: 'case',   ct: APIKEYS.length },
  { id: 'system', label: 'System',               icon: 'cog' },
  { id: 'audit',  label: 'Audit log',            icon: 'chart',  ct: 24910 },
];

export default function SettingsPage() {
  const [tab, setTab] = useState<TabId>('users');

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
            {tab === 'users'  && <UsersPanel />}
            {tab === 'perms'  && <PermsPanel />}
            {tab === 'api'    && <ApiPanel />}
            {tab === 'system' && <SystemPanel />}
            {tab === 'audit'  && <AuditPanel />}
          </div>
        </div>
      </div>
    </>
  );
}

function UsersPanel() {
  return (
    <div className="s-card">
      <div className="head">
        <div>
          <h2>All users</h2>
          <p>6 active · 0 suspended · 4 invitations pending</p>
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
        {USERS.map(u => (
          <div key={u.email} className="user-row">
            <div className="av">{u.id}</div>
            <div className="name">
              <b>{u.name}</b>
              <span>{u.email}</span>
            </div>
            <div><span className={'role r-' + u.role}>{u.role}</span></div>
            <div style={{ color: 'var(--ink-2)' }}>{u.last}</div>
            <div>
              <span className={'status ' + (u.status === 'off' ? 'is-off' : '')}>
                {u.status === 'off' ? 'Suspended' : 'Active'}
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

function PermsPanel() {
  return (
    <div className="s-card">
      <div className="head">
        <div>
          <h2>Roles & permissions</h2>
          <p>Read-only matrix · contact platform team to amend.</p>
        </div>
      </div>
      <table className="perm-table">
        <thead>
          <tr>
            <th>Capability</th>
            <th>Analyst</th>
            <th>Investigator</th>
            <th>Admin</th>
          </tr>
        </thead>
        <tbody>
          {PERMS.map((r, i) => (
            <tr key={i}>
              <td>{r.row}</td>
              <td className={r.analyst === 'y' ? 'y' : 'n'}>{r.analyst === 'y' ? '✓' : '—'}</td>
              <td className={r.investigator === 'y' ? 'y' : 'n'}>{r.investigator === 'y' ? '✓' : '—'}</td>
              <td className={r.admin === 'y' ? 'y' : 'n'}>{r.admin === 'y' ? '✓' : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ApiPanel() {
  return (
    <div className="s-card">
      <div className="head">
        <div>
          <h2>API keys</h2>
          <p>Key values are shown once at creation, then only the hash is stored.</p>
        </div>
        <button className="btn btn--brand"><Icon name="plus" size={14} /> Generate key</button>
      </div>
      <div>
        <div className="api-row is-head">
          <span>Label</span>
          <span>Hash</span>
          <span>Created</span>
          <span>Last used</span>
          <span style={{ textAlign: 'right' }}>Actions</span>
        </div>
        {APIKEYS.map((k, i) => (
          <div key={i} className="api-row">
            <div className="label"><b>{k.label}</b><span>scope · investigations</span></div>
            <div className="mono">{k.hash}</div>
            <div className="when">{k.created}</div>
            <div className="when">{k.lastUsed}</div>
            <div style={{ textAlign: 'right' }}>
              <button className="btn btn--ghost btn--sm">Rotate</button>
              <button className="btn btn--ghost btn--sm" style={{ marginLeft: 6, color: 'var(--danger)', borderColor: 'var(--danger-soft)' }}>Revoke</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SystemPanel() {
  return (
    <div>
      <div className="s-card">
        <div className="head"><div><h2>Rate limiting</h2><p>API throttles enforced per-key.</p></div></div>
        <ConfigRow label="Requests per minute"        value="6 000"  note="Burst 12 000" />
        <ConfigRow label="Concurrent investigations"  value="48"     note="per investigator" />
        <ConfigRow label="STR generations / hour"     value="20"     note="per investigator" />
      </div>
      <div className="s-card">
        <div className="head"><div><h2>Session</h2><p>JWT validity and refresh policy.</p></div></div>
        <ConfigRow label="JWT expiry"   value="8 hours"             note="Hard logout after expiry" />
        <ConfigRow label="Idle timeout" value="30 min"              note="Re-auth required" />
        <ConfigRow label="MFA"          value="Required for admin" />
      </div>
      <div className="s-card">
        <div className="head"><div><h2>Paths</h2><p>Operational file locations on the FIU-IND tenant.</p></div></div>
        <ConfigRow label="Audit log path"   value="/var/aegis/audit/chain.log"        mono />
        <ConfigRow label="Model directory"  value="/srv/aegis/models/v2.4.1/"          mono />
        <ConfigRow label="STR archive"      value="s3://aegis-fiu/str-submitted/"      mono />
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
      <button className="btn btn--ghost btn--sm">Edit</button>
    </div>
  );
}

function AuditPanel() {
  return (
    <div className="s-card">
      <div className="head">
        <div>
          <h2>Audit log <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 12, color: 'var(--ink-3)', fontWeight: 600 }}>· hash-chained</span></h2>
          <p>Showing 8 of 24,910 entries · chain head <code>blk#41 209 · prev 0x9c7a…f041</code></p>
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
        {AUDIT.map((r, i) => (
          <div key={i} className="audit-row">
            <span className="ts">{r[0]}</span>
            <span className="evt">{r[1]}</span>
            <span className="who">{r[2]}</span>
            <span>{r[3]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
