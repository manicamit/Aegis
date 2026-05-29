import Link from 'next/link';
import { Topbar } from '@/components/nav/Topbar';
import { Icon } from '@/components/shared/Icon';
import { CaseSidebar } from '@/components/workspace/CaseSidebar';
import { ShapPanel } from '@/components/workspace/ShapPanel';
import { GraphPane } from '@/components/workspace/GraphPane';
import { fetchCase, fetchCases, adaptToWorkspaceCase, type ApiCase } from '@/lib/cases';
import { fetchEgo, fetchSankey } from '@/lib/graph';

export const dynamic = 'force-dynamic';

interface WorkspacePageProps {
  searchParams: Promise<{ case?: string }>;
}

export default async function WorkspacePage({ searchParams }: WorkspacePageProps) {
  const sp = await searchParams;

  let apiCase: ApiCase | null = null;
  if (sp.case) {
    apiCase = await fetchCase(sp.case);
  } else {
    const cases = await fetchCases(1);
    if (cases.length > 0) apiCase = await fetchCase(cases[0].id);
  }

  if (!apiCase) {
    return (
      <div className="page__body">
        <div style={{ padding: 40, fontSize: 14, color: 'var(--ink-2)' }}>
          No cases available. Generate cases via the AEGIS pipeline (stage 6) to populate the workspace.
        </div>
      </div>
    );
  }

  const caseData = adaptToWorkspaceCase(apiCase);
  const accountId = apiCase.account_id ?? apiCase.account_reference;

  const [ego, sankey] = await Promise.all([
    fetchEgo(accountId, 2).catch(() => null),
    fetchSankey(accountId, 3).catch(() => null),
  ]);

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
          <CaseSidebar
            caseData={caseData}
            collapsedAlerts={apiCase.n_alerts_collapsed ?? null}
            confidence={apiCase.risk_score / 100}
          />
          <GraphPane ego={ego} sankey={sankey} />
          <ShapPanel
            plainEnglish={apiCase.plain_english}
            riskFactors={apiCase.risk_factors}
            score={caseData.score}
            fatfRules={caseData.fatfRules}
          />
        </div>
      </div>
    </>
  );
}
