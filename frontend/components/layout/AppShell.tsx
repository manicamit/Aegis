'use client';

import { usePathname } from 'next/navigation';
import { NavRail } from '@/components/nav/NavRail';

const PATH_TO_NAV_ID: Record<string, string> = {
  '/alerts':     'alerts',
  '/workspace':  'workspace',
  '/identity':   'identity',
  '/str':        'str',
  '/audit':      'audit',
  '/heartbeat':  'heartbeat',
  '/escalation': 'escalation',
  '/train':      'train',
  '/benchmarks': 'benchmarks',
  '/settings':   'settings',
};

function pathnameToNavId(pathname: string): string {
  for (const [prefix, id] of Object.entries(PATH_TO_NAV_ID)) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) return id;
  }
  return '';
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const activeId = pathnameToNavId(pathname);

  return (
    <div className="shell">
      <div className="app app--flat">
        <NavRail active={activeId} />
        <div className="page">{children}</div>
      </div>
    </div>
  );
}
