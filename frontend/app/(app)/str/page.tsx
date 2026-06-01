import { fetchCase, fetchCases, type ApiCase } from '@/lib/cases';
import STRView, { type STRDossier } from './STRView';

export const dynamic = 'force-dynamic';

function maskAccount(ref: string): string {
  return ref.length <= 4 ? 'XXXX-XX-' + ref : 'XXXX-XX-' + ref.slice(-4);
}

const FACTOR_REGEX = /^([+\-])\s*(.+?)\s*\(impact:\s*([\d.+\-]+)\)\s*$/i;

function parseShap(factors: string[]): [string, string, string][] {
  return factors.map(raw => {
    const m = FACTOR_REGEX.exec(raw);
    if (!m) return [raw.replace(/^[+\-]\s*/, ''), '—', ''] as [string, string, string];
    const sign = m[1] === '-' ? '−' : '+';
    return [m[2], `${sign}${m[3]}`, raw] as [string, string, string];
  });
}

function splitNistRmf(s: string): string[] {
  return s.split(/[+,·]/).map(x => x.trim()).filter(Boolean);
}

function buildDossier(apiCase: ApiCase): STRDossier {
  return {
    caseId:   apiCase.case_id,
    masked:   maskAccount(apiCase.account_reference),
    bank:     `Account ${apiCase.account_reference}`,
    branch:   '—',
    score:    Math.round(apiCase.risk_score),
    generated: apiCase.generated_at,
    version:  apiCase.system_version,
    prompt:   '—',
    model:    '—',
    source:   'live',
    reviewer: '—',
    fatf:     apiCase.compliance.fatf_rules_triggered.map(code => [code, code] as [string, string]),
    nistRMF:  splitNistRmf(apiCase.compliance.nist_rmf_alignment),
    shap:     parseShap(apiCase.risk_factors),
    tx:       [],
    graph:    { layering: 0, circular: false, flaggedNeighbours: 0, dormancy: '—', branches: 0 },
    totals: {
      total:    '₹' + apiCase.total_amount.toLocaleString('en-IN'),
      count:    apiCase.transaction_count,
      window:   '—',
      channels: '—',
    },
  };
}

interface STRPageProps {
  searchParams: Promise<{ case?: string }>;
}

export default async function STRPage({ searchParams }: STRPageProps) {
  const sp = await searchParams;

  let caseIdToFetch = sp.case;
  if (!caseIdToFetch) {
    const list = await fetchCases(1).catch(() => []);
    caseIdToFetch = list[0]?.id;
  }

  if (!caseIdToFetch) {
    return (
      <div className="page__body">
        <div style={{ padding: 40, fontSize: 14, color: 'var(--ink-2)' }}>
          No cases available. Generate cases via the AEGIS pipeline (stage 6) to draft STR narratives.
        </div>
      </div>
    );
  }

  const apiCase = await fetchCase(caseIdToFetch).catch(() => null);
  if (!apiCase) {
    return (
      <div className="page__body">
        <div style={{ padding: 40, fontSize: 14, color: 'var(--ink-2)' }}>
          Case {caseIdToFetch} not found.
        </div>
      </div>
    );
  }

  const dossier = buildDossier(apiCase);
  return (
    <STRView
      dossier={dossier}
      narrative={apiCase.str_narrative}
      plainEnglish={apiCase.plain_english}
    />
  );
}
