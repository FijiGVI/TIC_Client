'use client';

import { IconChevronLeft, IconChevronRight, IconClipboardList, IconDatabaseImport, IconForms, IconHistory, IconLayoutDashboard, IconLogout, IconMenu2, IconShieldLock, IconUsers, IconX } from '@tabler/icons-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { actApi, api } from '@/lib/api';
import { PageHelp } from '@/components/PageHelp';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

export function PortalShell({ children }: { children: ReactNode }) {
  const { user, loading, logout, refreshUser } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    let timeout = window.setTimeout(() => void logout(), IDLE_TIMEOUT_MS);
    const reset = () => { window.clearTimeout(timeout); timeout = window.setTimeout(() => void logout(), IDLE_TIMEOUT_MS); };
    const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((event) => window.addEventListener(event, reset, { passive: true }));
    return () => { window.clearTimeout(timeout); events.forEach((event) => window.removeEventListener(event, reset)); };
  }, [logout, user]);

  const changePassword = async () => {
    setPasswordError('');
    try {
      if (user?.id.startsWith('tic:')) await api.post('/auth/change-password', { newPassword: password });
      else await actApi.post('/auth/change-password', { newPassword: password });
      setPassword(''); setPasswordOpen(false); await refreshUser();
    } catch (reason) { setPasswordError(reason instanceof Error ? reason.message : 'Unable to update password'); }
  };

  const saveProfile = async () => {
    setPasswordError('');
    try { await api.patch('/profile', { name: profileName, email: profileEmail }); await refreshUser(); setProfileEditing(false); }
    catch (reason) { setPasswordError(reason instanceof Error ? reason.message : 'Unable to update profile'); }
  };

  if (loading || !user) return <><main className="center-screen" aria-live="polite"><div className="spinner" /><p>{loading ? 'Loading your workspace…' : 'Redirecting to login…'}</p></main><div hidden aria-hidden="true" inert>{children}</div></>;

  const links = [
    { href: '/dashboard', label: 'Dashboard', icon: IconLayoutDashboard, show: true },
    { href: '/requests', label: 'My requests', icon: IconClipboardList, show: user.permissions.includes('requests.read.own') || user.permissions.includes('requests.create') },
    { href: '/service-requests', label: 'Manage requests', icon: IconForms, show: user.permissions.some((permission) => ['requests.read.all', 'requests.read.assigned'].includes(permission)) },
    { href: '/admin/forms', label: 'Form builder', icon: IconForms, show: user.permissions.includes('forms.manage') },
    { href: '/admin/users', label: 'Users', icon: IconUsers, show: user.permissions.includes('users.manage') },
    { href: '/admin/audit-logs', label: 'Audit logs', icon: IconHistory, show: user.permissions.includes('users.manage') },
    { href: '/admin/roles', label: 'Roles & permissions', icon: IconShieldLock, show: user.permissions.includes('roles.manage') },
    { href: '/admin/sharepoint', label: 'SharePoint data', icon: IconDatabaseImport, show: user.permissions.includes('forms.manage') },
  ].filter((link) => link.show);
  const providerManagesPassword = user.id.startsWith('microsoft:');

  return <div className={`portal ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
    <aside className={`sidebar ${navigationOpen ? 'mobile-open' : ''}`} id="primary-sidebar">
      <div className="brand"><span>G</span><div><strong>GVI Ticketing</strong><small>Employee Services</small></div></div>
      <button className="sidebar-collapse" type="button" aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setSidebarCollapsed((value) => !value)}>{sidebarCollapsed ? <IconChevronRight size={18} /> : <IconChevronLeft size={18} />}</button>
      <nav aria-label="Primary navigation">{links.map(({ href, label, icon: Icon }) => <Link className={pathname === href ? 'active' : ''} href={href} key={href} title={sidebarCollapsed ? label : undefined} aria-current={pathname === href ? 'page' : undefined} onClick={() => setNavigationOpen(false)}><Icon size={20} /><span>{label}</span></Link>)}</nav>
      <div className="sidebar-user">
        <span>{user.name.slice(0, 1).toUpperCase()}</span><div><strong>{user.name}</strong><small>{user.role.replace('_', ' ')}</small></div>
        <button aria-label="Open profile menu" title="Profile options" aria-expanded={profileOpen} onClick={() => { setProfileName(user.name); setProfileEmail(user.email); setProfileOpen((value) => !value); }}>•••</button>
        {profileOpen && <div className="profile-menu">{profileEditing ? <><label>Name<input value={profileName} onChange={(event) => setProfileName(event.target.value)} /></label><label>Email<input type="email" value={profileEmail} onChange={(event) => setProfileEmail(event.target.value)} /></label><button type="button" onClick={() => void saveProfile()}>Save profile</button></> : <><strong>{user.name}</strong><small>{user.email}</small><small>{user.role.replace('_', ' ')}</small>{user.id.startsWith('tic:') && <button type="button" onClick={() => setProfileEditing(true)}>Edit profile</button>}{providerManagesPassword ? <p>Password managed by Microsoft.</p> : <button type="button" onClick={() => { setProfileOpen(false); setPasswordOpen(true); }}>Change password</button>}</>}</div>}
        <button className="sidebar-logout" onClick={() => void logout()}><IconLogout size={18} /><span>Log out</span></button>
      </div>
    </aside>
    {navigationOpen && <button className="sidebar-backdrop" type="button" aria-label="Close navigation" onClick={() => setNavigationOpen(false)} />}
    <header className="mobile-header"><button className="mobile-menu-toggle" type="button" aria-label={navigationOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={navigationOpen} aria-controls="primary-sidebar" onClick={() => setNavigationOpen((open) => !open)}>{navigationOpen ? <IconX size={21} /> : <IconMenu2 size={21} />}</button><Link className="mobile-brand" href="/dashboard" aria-label="GVI Ticketing System home"><span>G</span><strong>GVI Ticketing</strong></Link><div className="mobile-account"><span>{user.name}</span><button type="button" onClick={() => void logout()} aria-label="Log out"><IconLogout size={18} /></button></div></header>
    <main className="portal-main">{children}</main>
    <PageHelp pathname={pathname} />
    {(passwordOpen || user.mustChangePassword) && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="password-title"><h2 id="password-title">Change password</h2><p>{user.mustChangePassword ? 'Set a new password before continuing.' : 'Use at least 12 characters with uppercase, lowercase, and a number.'}</p>{passwordError && <div className="alert">{passwordError}</div>}<label>New password<input type="password" minLength={12} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><div className="modal-actions">{!user.mustChangePassword && <button className="secondary" onClick={() => setPasswordOpen(false)}>Cancel</button>}<button className="primary" disabled={password.length < 12} onClick={() => void changePassword()}>Update password</button></div></section></div>}
  </div>;
}
