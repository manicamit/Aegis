import { fetchIdentityClusters } from '@/lib/identity';
import { IdentityView } from './IdentityView';

export const dynamic = 'force-dynamic';

export default async function IdentityPage() {
  let data;
  try {
    data = await fetchIdentityClusters();
  } catch {
    data = {
      accounts: [],
      links:    [],
      clusters: [],
      signals:  [
        { id: 'device',      label: 'Shared Device',      color: '#2ad1c3' },
        { id: 'ip',          label: 'Shared IP',          color: '#fbbf24' },
        { id: 'beneficiary', label: 'Shared Beneficiary', color: '#a78bfa' },
        { id: 'upi',         label: 'Shared UPI Handle',  color: '#22d3ee' },
        { id: 'phone',       label: 'Shared Phone',       color: '#f08a5d' },
      ] as const,
      generated_at: 0,
      source: 'empty',
    };
  }
  return <IdentityView data={data as Parameters<typeof IdentityView>[0]['data']} />;
}
