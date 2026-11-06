import { RequestList } from '@/components/RequestList';

export default async function RequestsPage({ searchParams }: PageProps<'/requests'>) {
  const parameters = await searchParams;
  return <RequestList allowCreate initialCreateOpen={parameters.new === '1'} />;
}
