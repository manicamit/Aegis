import { Topbar } from '@/components/nav/Topbar';
import { Icon } from '@/components/shared/Icon';
import { CaseSidebar } from '@/components/workspace/CaseSidebar';
import { ShapPanel } from '@/components/workspace/ShapPanel';
import { GraphPane } from '@/components/workspace/GraphPane';
import { WORKSPACE_CASE } from '@/lib/workspace-data';

interface WorkspacePageProps {
  searchParams: Promise<{ case?: string }>;
}

export default async function WorkspacePage({ searchParams }: WorkspacePageProps) {
  const sp = await searchParams;
  const caseId = sp.case ?? WORKSPACE_CASE.id;
  const c = WORKSPACE_CASE;

  return (
    <>
      <Topbar
        title={`Case ${caseId}`}
        subtitle={`${c.bank} · ${c.masked}`}
        breadcrumbs={[
          { label: 'Home', href: '/alerts' },
          { label: 'Case queue', href: '/alerts' },
          { label: caseId },
        ]}
      >
        <a href="/propagation" className="btn btn--ghost"><Icon name="graph" size={14} /> Propagate risk</a>
        <a href="/identity" className="btn btn--ghost"><Icon name="device" size={14} /> Identity links</a>
        <a href="/str" className="btn btn--brand"><Icon name="flag" size={14} /> Generate STR</a>
      </Topbar>

      <div className="page__body">
        <div className="ws">
          <CaseSidebar />
          <GraphPane />
          <ShapPanel />
        </div>
      </div>
    </>
  );
}
