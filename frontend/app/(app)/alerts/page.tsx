import { Topbar } from '@/components/nav/Topbar';

export default function AlertsPage() {
  return (
    <>
      <Topbar
        title="Case queue"
        subtitle="Triage · prioritise · file STRs"
        breadcrumbs={[{ label: 'AEGIS' }, { label: 'Alert Queue' }]}
      >
        <button className="btn btn--ghost btn--sm">Export</button>
        <button className="btn btn--brand btn--sm">New case</button>
      </Topbar>
      <div className="page__body">
        <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>
          Alert queue — Phase 3 implementation coming next.
        </p>
      </div>
    </>
  );
}
