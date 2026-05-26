import Link from 'next/link';

interface Breadcrumb {
  label: string;
  href?: string;
}

interface TopbarProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: Breadcrumb[];
  children?: React.ReactNode;
}

export function Topbar({ title, subtitle, breadcrumbs, children }: TopbarProps) {
  return (
    <header className="topbar">
      <div className="topbar__title">
        {breadcrumbs && (
          <div className="topbar__crumbs">
            {breadcrumbs.map((b, i) => (
              <span key={i} style={{ display: 'contents' }}>
                {i > 0 && <span className="topbar__sep">/</span>}
                {b.href
                  ? <Link href={b.href}>{b.label}</Link>
                  : <span>{b.label}</span>}
              </span>
            ))}
          </div>
        )}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="topbar__actions">{children}</div>
    </header>
  );
}
