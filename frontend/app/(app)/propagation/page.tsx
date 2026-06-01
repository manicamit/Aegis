import Link from 'next/link';
import { Topbar } from '@/components/nav/Topbar';
import { Icon } from '@/components/shared/Icon';
import { fetchCase, fetchCases } from '@/lib/cases';
import { fetchPropagation } from '@/lib/graph';
import { PropagationView } from './PropagationView';

export const dynamic = 'force-dynamic';

interface PropagationPageProps {
  searchParams: Promise<{ case?: string; account?: string; alpha?: string }>;
}

export default async function PropagationPage({ searchParams }: PropagationPageProps) {
  const sp = await searchParams;
  const alpha = sp.alpha ? Number(sp.alpha) : 0.85;

  let seedAccount: string | null = sp.account ?? null;

  if (!seedAccount && sp.case) {
    const c = await fetchCase(sp.case);
    seedAccount = c?.account_id ?? c?.account_reference ?? null;
  }
  if (!seedAccount) {
    const recent = await fetchCases(1);
    if (recent.length > 0) {
      const c = await fetchCase(recent[0].id);
      seedAccount = c?.account_id ?? c?.account_reference ?? null;
    }
  }

  const propagation = seedAccount
    ? await fetchPropagation([seedAccount], alpha).catch(() => null)
    : null;

  return (
    <>
      <Topbar
        title="Risk Propagation"
        subtitle={
          seedAccount
            ? `Personalised PageRank from seed · α = ${alpha.toFixed(2)}`
            : 'Personalised PageRank — no seed account available'
        }
        breadcrumbs={[
          { label: 'Home', href: '/alerts' },
          { label: 'Workspace', href: '/workspace' },
          { label: 'Propagation' },
        ]}
      >
        <Link href="/workspace" className="btn btn--ghost"><Icon name="chev-l" size={14} /> Back</Link>
        <button className="btn btn--ghost"><Icon name="export" size={14} /> Export CSV</button>
      </Topbar>

      <div className="page__body">
        {!propagation ? (
          <div style={{ padding: 40, fontSize: 14, color: 'var(--ink-2)' }}>
            {seedAccount
              ? `No propagation result for seed ${seedAccount}. The transaction graph may be unavailable.`
              : 'No case available to seed propagation. Generate cases via the AEGIS pipeline.'}
          </div>
        ) : (
          <PropagationView seed={seedAccount!} propagation={propagation} alpha={alpha} />
        )}
      </div>
    </>
  );
}
