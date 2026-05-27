import { fetchCases } from '@/lib/cases';
import AlertsView from './AlertsView';

export const dynamic = 'force-dynamic';

export default async function AlertsPage() {
  const cases = await fetchCases(50);
  return <AlertsView cases={cases} />;
}
