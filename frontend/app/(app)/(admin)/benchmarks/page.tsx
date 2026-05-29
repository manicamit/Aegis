import { fetchBenchmark } from '@/lib/metrics';
import BenchmarksView from './BenchmarksView';

export const dynamic = 'force-dynamic';

export default async function BenchmarksPage() {
  const payload = await fetchBenchmark();
  return <BenchmarksView payload={payload} />;
}
