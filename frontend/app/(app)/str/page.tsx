import { fetchCase, fetchCases } from '@/lib/cases';
import STRView, { type STRDossier } from './STRView';

export const dynamic = 'force-dynamic';

const FIXTURE_DOSSIER: STRDossier = {
  caseId: 'AGS-2027H',
  masked: 'XXXX-XX-9126',
  bank: 'Yes Bank · Mumbai · Bandra-W',
  branch: 'IFSC YESB0000291',
  score: 94,
  generated: '2026-05-25T09:14:08Z',
  version: 'AEGIS v2.4.1',
  prompt: 'prompt v4.2',
  model: 'anthropic-claude-3-5',
  source: 'pre-generated',
  reviewer: 'Agent Smith · AGS-MUM-1',
  fatf: [
    ['FATF-R10', 'Structuring'],
    ['FATF-R16', 'Cross-border layering'],
    ['FATF-R20', 'Dormant activation'],
    ['FATF-R32', 'Fan-in fan-out'],
  ],
  nistRMF: ['GOVERN-1.1', 'MAP-2.3', 'MEASURE-2.6', 'MANAGE-3.1'],
  shap: [
    ['Burst transfer pattern',        '+0.28', '12 tx in 4h, all sub-threshold'],
    ['Dormant account reactivation',  '+0.22', '217 days dormancy before burst'],
    ['GAT proximity to mule cluster', '+0.19', 'Cluster S-19 · FIU-IND ref 8821'],
    ['Layering depth ≥6 hops',        '+0.15', 'Terminal cash-out at MCC 6010'],
    ['Sub-threshold deposit pattern', '+0.11', 'Mean credit ₹40,583'],
  ],
  tx: [
    ['May 18 14:02', 'IMPS', '→ ICICI ·8841',  '₹2,50,000'],
    ['May 19 11:48', 'NEFT', '→ Osaka ·1234',  '₹1,80,000'],
    ['May 21 22:31', 'UPI',  '→ UPI@swiftpay', '₹92,000'],
    ['May 22 06:05', 'UPI',  '→ Kotak ·1199',  '₹80,000'],
    ['May 23 10:18', 'POS',  '→ Quick Cash',   '₹1,32,000'],
    ['May 23 11:42', 'CASH', '→ PNB ·6620',    '₹1,10,000'],
  ],
  graph: { layering: 6, circular: true, flaggedNeighbours: 4, dormancy: '217 days', branches: 3 },
  totals: { total: '₹8,42,000', count: 38, window: 'May 03 – May 24, 2026', channels: 'UPI, IMPS, NEFT, RTGS, POS' },
};

const FIXTURE_NARRATIVE = `Subject account XXXX-XX-9126 (case AGS-2027H), held at Yes Bank Mumbai (Bandra-W branch, IFSC YESB0000291), exhibits a confluence of behaviours consistent with structured laundering under FATF Recommendations 10, 16, 20, and 32.

The account was dormant for 217 calendar days prior to 03 May 2026, at which point it was reactivated via a single small-value deposit followed within 21 hours by a coordinated burst of twelve credit transactions totalling ₹4,87,000, each of which fell below the ₹50,000 threshold that triggers mandatory STR-CTR aggregation under PMLA 2002 § 12. The temporal clustering of these credits (mean inter-arrival 19 minutes; burst score 0.91) is inconsistent with the account's historical transaction velocity, which had averaged 1.4 transactions per month over the prior 28 salary-credit months.

Network analysis indicates the subject account is two hops removed, via shared device-fingerprint and beneficiary-overlap signals, from cluster S-19, a previously confirmed mule ring under FIU-IND reference 8821. AEGIS graph-attention scoring assigns a proximity-risk weight of 0.74. Across the 21-day active window, ₹8,42,000 was layered through six counterparty hops terminating in cash-out transactions at a single POS merchant (MCC 6010) totalling ₹1,32,000.

Concurrent indicators include a geo-IP mismatch of 1,820 km between the login session (Mumbai) and the originating transaction endpoint (Phnom Penh VPN exit), the use of a single shared mobile device across four otherwise unrelated accounts, and four flagged neighbours within a two-hop radius.

Based on the foregoing, the account presents a high probability of operating as a structured-deposit channel for proceeds of unknown origin, with onward layering to a known mule cluster. This report is filed pursuant to PMLA § 12(1)(b) read with FIU-IND Guidelines 2023 § 4.3.`;

function maskAccount(ref: string): string {
  return ref.length <= 4 ? 'XXXX-XX-' + ref : 'XXXX-XX-' + ref.slice(-4);
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
    return <STRView dossier={FIXTURE_DOSSIER} narrative={FIXTURE_NARRATIVE} />;
  }

  const apiCase = await fetchCase(caseIdToFetch).catch(() => null);
  if (!apiCase) {
    return <STRView dossier={FIXTURE_DOSSIER} narrative={FIXTURE_NARRATIVE} />;
  }
  const plainEnglish = apiCase.plain_english;

  const fatfPairs: [string, string][] = apiCase.compliance.fatf_rules_triggered.length > 0
    ? apiCase.compliance.fatf_rules_triggered.map(code => [code, code])
    : FIXTURE_DOSSIER.fatf;

  const dossier: STRDossier = {
    ...FIXTURE_DOSSIER,
    caseId:   apiCase.case_id,
    masked:   maskAccount(apiCase.account_reference),
    bank:     `Account ${apiCase.account_reference}`,
    score:    Math.round(apiCase.risk_score),
    generated: apiCase.generated_at,
    source:   'live',
    fatf:     fatfPairs,
    totals: {
      ...FIXTURE_DOSSIER.totals,
      total: '₹' + apiCase.total_amount.toLocaleString('en-IN'),
      count: apiCase.transaction_count,
    },
  };

  return <STRView dossier={dossier} narrative={apiCase.str_narrative} plainEnglish={plainEnglish} />;
}
