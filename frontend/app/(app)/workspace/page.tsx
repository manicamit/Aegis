import Link from 'next/link';
import { Topbar } from '@/components/nav/Topbar';
import { Icon } from '@/components/shared/Icon';
import { CaseSidebar } from '@/components/workspace/CaseSidebar';
import { ShapPanel } from '@/components/workspace/ShapPanel';
import { GraphPane } from '@/components/workspace/GraphPane';
import { WORKSPACE_CASE } from '@/lib/workspace-data';
import { fetchCase, fetchCases, adaptToWorkspaceCase } from '@/lib/cases';

export const dynamic = 'force-dynamic';

interface WorkspacePageProps {
  searchParams: Promise<{ case?: string }>;
}

export default async function WorkspacePage({ searchParams }: WorkspacePageProps) {
  const sp = await searchParams;

  let caseData = WORKSPACE_CASE;
  if (sp.case) {
    const apiCase = await fetchCase(sp.case);
    if (apiCase) caseData = adaptToWorkspaceCase(apiCase);
  } else {
    const cases = await fetchCases(1);
    if (cases.length > 0) {
      const first = await fetchCase(cases[0].id);
      if (first) caseData = adaptToWorkspaceCase(first);
    }
  }

  return (
    <>
      <Topbar
        title={`Case ${caseData.id}`}
        subtitle={`${caseData.bank} · ${caseData.masked}`}
        breadcrumbs={[
          { label: 'Home', href: '/alerts' },
          { label: 'Case queue', href: '/alerts' },
          { label: caseData.id },
        ]}
      >
        <Link href="/propagation" className="btn btn--ghost"><Icon name="graph" size={14} /> Propagate risk</Link>
        <Link href="/identity" className="btn btn--ghost"><Icon name="device" size={14} /> Identity links</Link>
        <Link href={`/str?case=${encodeURIComponent(caseData.id)}`} className="btn btn--brand"><Icon name="flag" size={14} /> Generate STR</Link>
      </Topbar>

      <div className="page__body">
        <div className="ws">
          <CaseSidebar caseData={caseData} />
          <GraphPane />
          <ShapPanel />
        </div>
      </div>
    </>
  );
}
