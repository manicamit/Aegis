import { fetchBenchmark } from '@/lib/metrics';
import BenchmarksView from './BenchmarksView';

export const dynamic = 'force-dynamic';

export default async function BenchmarksPage() {
  const benchmark = await fetchBenchmark();
  return <BenchmarksView benchmark={benchmark} />;
}
