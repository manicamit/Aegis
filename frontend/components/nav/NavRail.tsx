'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/shared/Icon';
import { getRole } from '@/lib/auth';
import { useRouter } from 'next/navigation';

interface WhoAmI {
  username: string;
  role:     string;
}

function initialsOf(username: string): string {
  if (!username) return '??';
  const parts = username.replace(/[._@]/g, ' ').split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function displayName(username: string): string {
  const base = username.split('@')[0].replace(/[._]/g, ' ');
  return base.split(/\s+/).filter(Boolean).map(p => p[0].toUpperCase() + p.slice(1)).join(' ') || username;
}

const MAIN_ITEMS = [
  { id: 'alerts',    href: '/alerts',    icon: 'home',     label: 'Alert Queue' },
  { id: 'workspace', href: '/workspace', icon: 'case',     label: 'Investigation Workspace' },
  { id: 'identity',  href: '/identity',  icon: 'graph',    label: 'Identity Linking' },
  { id: 'str',       href: '/str',       icon: 'flag',     label: 'STR Narrative', dot: true },
];

const ADMIN_ITEMS = [
  { id: 'audit',      href: '/audit',      icon: 'chart',    label: 'Audit Trail' },
  { id: 'heartbeat',  href: '/heartbeat',  icon: 'activity', label: 'Service Health' },
  { id: 'escalation', href: '/escalation', icon: 'layers',   label: 'Escalation Queue' },
  { id: 'benchmarks', href: '/benchmarks', icon: 'spark',    label: 'Benchmarks' },
  { id: 'settings',   href: '/settings',   icon: 'cog',      label: 'Settings' },
];

interface NavRailProps {
  active: string;
}

export function NavRail({ active }: NavRailProps) {
  const localRole = getRole();
  const router = useRouter();
  const [me, setMe] = useState<WhoAmI | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/whoami', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(json => { if (!cancelled && json) setMe(json as WhoAmI); })
      .catch(() => { /* fall back to local-role display */ });
    return () => { cancelled = true; };
  }, []);
  const role     = (me?.role ?? localRole) as string;
  const username = me?.username ?? '';
  const isAdmin  = role === 'admin';

  const handleSignOut = async () => {
    try { localStorage.removeItem('aegis_role'); } catch { /* ignore */ }
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  return (
    <aside className="nav">
      <Link href="/alerts" className="nav__logo" title="Aegis">
        <Icon name="shield" size={22} />
      </Link>
      <div className="nav__divider" />

      {MAIN_ITEMS.map(it => (
        <Link
          key={it.id}
          href={it.href}
          className={'nav__btn ' + (active === it.id ? 'is-active' : '')}
          title={it.label}
        >
          <Icon name={it.icon} size={20} />
          {it.dot && <span className="dot" />}
        </Link>
      ))}

      <div className="nav__divider" style={{ margin: '6px 0' }} />

      <div style={{
        font: "700 8px/1 'Manrope'", letterSpacing: '.2em', textTransform: 'uppercase',
        color: 'var(--nav-fg-mute)', textAlign: 'center', padding: '4px 0 2px',
        userSelect: 'none',
      }}>ADM</div>

      {ADMIN_ITEMS.map(it => (
        <Link
          key={it.id}
          href={isAdmin ? it.href : '/login'}
          className={'nav__btn ' + (active === it.id ? 'is-active' : '') + (!isAdmin ? ' is-locked' : '')}
          title={isAdmin ? it.label : it.label + ' · Admin only'}
          style={{ position: 'relative', opacity: isAdmin ? 1 : 0.4 }}
        >
          <Icon name={it.icon} size={20} />
          {!isAdmin && (
            <span style={{
              position: 'absolute', top: 4, right: 4,
              width: 7, height: 7, borderRadius: '50%',
              background: 'var(--nav-fg-mute)',
            }} />
          )}
        </Link>
      ))}

      <div className="nav__spacer" />

      <div
        title={'Signed in as ' + (username || role)}
        style={{
          width: 32, height: 32, borderRadius: 8, margin: '0 auto 4px',
          background: role === 'admin' ? 'linear-gradient(135deg,#6e6bd4,#3b38b0)' : 'var(--nav-pill)',
          display: 'grid', placeItems: 'center',
          font: "700 9px/1 'Manrope'", letterSpacing: '.1em', textTransform: 'uppercase',
          color: role === 'admin' ? '#fff' : 'var(--nav-fg-mute)',
          cursor: 'default',
        }}
      >
        {role.slice(0, 3).toUpperCase()}
      </div>

      <div className="nav__avatar" title={username ? displayName(username) : 'Not signed in'}>
        {username ? initialsOf(username) : '—'}
      </div>

      <button className="nav__btn" title="Sign out" onClick={handleSignOut}>
        <Icon name="exit" size={20} />
      </button>
    </aside>
  );
}
