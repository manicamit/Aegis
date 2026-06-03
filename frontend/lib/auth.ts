import type { UserRole } from '@/types/aegis';

export function getRole(): UserRole {
  try {
    return (localStorage.getItem('aegis_role') as UserRole) ?? 'investigator';
  } catch {
    return 'investigator';
  }
}

export function setSession(role: UserRole): void {
  try { localStorage.setItem('aegis_role', role); } catch { /* SSR guard */ }
}

export function clearSession(): void {
  try { localStorage.removeItem('aegis_role'); } catch { /* SSR guard */ }
}

export const ROLE_REDIRECTS: Record<UserRole, string> = {
  investigator: '/alerts',
  analyst: '/alerts',
  admin: '/train',
  branch_manager: '/mobile',
};
