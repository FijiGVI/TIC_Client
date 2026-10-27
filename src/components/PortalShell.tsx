'use client';

import {
  IconClipboardList,
  IconFilePlus,
  IconForms,
  IconLogout,
  IconUsers,
} from '@tabler/icons-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';

export function PortalShell({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <>
        <main className="center-screen" aria-live="polite">
          <div className="spinner" />
          <p>{loading ? 'Loading your workspace…' : 'Redirecting to sign in…'}</p>
        </main>
        <div hidden aria-hidden="true" inert>
          {children}
        </div>
      </>
    );
  }

  const links = [
    { href: '/dashboard', label: 'My requests', icon: IconClipboardList, show: true },
    { href: '/form-request', label: 'New request', icon: IconFilePlus, show: user.permissions.includes('requests.create') },
    {
      href: '/service-requests',
      label: 'Manage requests',
      icon: IconForms,
      show: user.permissions.some((permission) => ['requests.read.all', 'requests.read.assigned'].includes(permission)),
    },
    { href: '/admin/forms', label: 'Form builder', icon: IconForms, show: user.permissions.includes('forms.manage') },
    { href: '/admin/users', label: 'Users & roles', icon: IconUsers, show: user.permissions.includes('users.manage') },
  ].filter((link) => link.show);

  return (
    <div className="portal">
      <aside className="sidebar">
        <div className="brand">
          <span>T</span>
          <div><strong>TIC</strong><small>Employee Services</small></div>
        </div>
        <nav>
          {links.map(({ href, label, icon: Icon }) => (
            <Link className={pathname === href ? 'active' : ''} href={href} key={href}>
              <Icon size={20} />{label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-user">
          <span>{user.name.slice(0, 1).toUpperCase()}</span>
          <div><strong>{user.name}</strong><small>{user.role.replace('_', ' ')}</small></div>
          <button aria-label="Sign out" onClick={() => void logout()}><IconLogout size={19} /></button>
        </div>
      </aside>
      <main className="portal-main">{children}</main>
    </div>
  );
}
