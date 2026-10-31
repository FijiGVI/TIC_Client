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
import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { api } from '@/lib/api';

export function PortalShell({ children }: { children: ReactNode }) {
  const { user, loading, logout, refreshUser } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  const changePassword = async () => {
    setPasswordError('');
    try { await api.post('/auth/change-password', { password }); setPassword(''); setPasswordOpen(false); await refreshUser(); }
    catch (reason) { setPasswordError(reason instanceof Error ? reason.message : 'Unable to update password'); }
  };

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
          <button aria-label="Change password" title="Change password" onClick={() => setPasswordOpen(true)}>•••</button><button aria-label="Sign out" onClick={() => void logout()}><IconLogout size={19} /></button>
        </div>
      </aside>
      <main className="portal-main">{children}</main>{(passwordOpen || user.mustChangePassword) && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="password-title"><h2 id="password-title">Change password</h2><p>{user.mustChangePassword ? 'Set a new password before continuing.' : 'Use at least 12 characters with uppercase, lowercase, and a number.'}</p>{passwordError && <div className="alert">{passwordError}</div>}<label>New password<input type="password" minLength={12} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><div className="modal-actions">{!user.mustChangePassword && <button className="secondary" onClick={() => setPasswordOpen(false)}>Cancel</button>}<button className="primary" disabled={password.length < 12} onClick={() => void changePassword()}>Update password</button></div></section></div>}
    </div>
  );
}
