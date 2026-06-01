import { fetchAuditTrail } from '@/lib/audit';
import { AuditView } from './AuditView';

export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  let initial;
  try {
    initial = await fetchAuditTrail({ limit: 50 });
  } catch {
    initial = {
      rows: [],
      total: 0,
      limit: 50,
      offset: 0,
      family_counts: {},
      integrity: {
        total_entries:   0,
        verified_window: 0,
        anomalies:       [],
        head_hash:       null,
        head_prev:       null,
        last_timestamp:  null,
      },
      generated_at: 0,
    };
  }
  return <AuditView initial={initial} />;
}
