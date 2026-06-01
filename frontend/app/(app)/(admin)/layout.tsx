import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const role = cookieStore.get('aegis_role')?.value;
  if (role !== 'admin') redirect('/alerts');
  return <>{children}</>;
}
