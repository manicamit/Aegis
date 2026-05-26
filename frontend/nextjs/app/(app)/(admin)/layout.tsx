import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

// Phase 2: this guard becomes the authoritative admin check once cookies are set by /api/auth/login.
// In Phase 1, the aegis_role cookie isn't set (login only writes localStorage), so this is a no-op.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const role = cookieStore.get('aegis_role')?.value;

  // Only enforce the guard when a cookie is actually present (avoids Phase 1 lockouts).
  if (role && role !== 'admin') redirect('/alerts');

  return <>{children}</>;
}
