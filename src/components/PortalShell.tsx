'use client';

import { IconChevronLeft, IconChevronRight, IconClipboardList, IconDatabaseImport, IconForms, IconHistory, IconLayoutDashboard, IconLogout, IconMenu2, IconSettings, IconShieldLock, IconUsers, IconX } from '@tabler/icons-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { actApi, api } from '@/lib/api';
import { PageHelp } from '@/components/PageHelp';

export function PortalShell({ children }: { children: ReactNode }) {
  const { user, loading, logout, refreshUser, switchRole } = useAuth();
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
  const [profileError, setProfileError] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [idleTimeoutMinutes, setIdleTimeoutMinutes] = useState(30);
  const [welcomeOpen, setWelcomeOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    void api.get<{ data: { sessionIdleTimeoutMinutes: number } }>('/settings/client')
      .then((response) => setIdleTimeoutMinutes(response.data.sessionIdleTimeoutMinutes))
      .catch(() => undefined);
    const key = `tic.welcomeSeen.${user.id}`;
    const timer = window.setTimeout(() => { if (!localStorage.getItem(key)) setWelcomeOpen(true); }, 0);
    return () => window.clearTimeout(timer);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const timeoutMs = idleTimeoutMinutes * 60 * 1000;
    let timeout = window.setTimeout(() => void logout(), timeoutMs);
    const reset = () => { window.clearTimeout(timeout); timeout = window.setTimeout(() => void logout(), timeoutMs); };
    const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((event) => window.addEventListener(event, reset, { passive: true }));
    return () => { window.clearTimeout(timeout); events.forEach((event) => window.removeEventListener(event, reset)); };
  }, [idleTimeoutMinutes, logout, user]);

  const closeWelcome = () => {
    if (user) localStorage.setItem(`tic.welcomeSeen.${user.id}`, 'true');
    setWelcomeOpen(false);
  };

  const changeActiveRole = async (role: string) => {
    setProfileError('');
    try {
      await switchRole(role);
      setProfileOpen(false);
    } catch (reason) {
      setProfileError(reason instanceof Error ? reason.message : 'Unable to change your active role');
    }
  };

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
    { href: '/admin/settings', label: 'Settings', icon: IconSettings, show: user.permissions.includes('roles.manage') },
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
        {profileOpen && <div className="profile-menu">{profileError && <p className="profile-error" role="alert">{profileError}</p>}{profileEditing ? <><label>Name<input value={profileName} onChange={(event) => setProfileName(event.target.value)} /></label><label>Email<input type="email" value={profileEmail} onChange={(event) => setProfileEmail(event.target.value)} /></label><button type="button" onClick={() => void saveProfile()}>Save profile</button></> : <><strong>{user.name}</strong><small>{user.email}</small><small>{user.organizationName || user.organizationType?.replaceAll('_', ' ')}</small>{user.roles.length > 1 && <label>Active role<select value={user.role} onChange={(event) => void changeActiveRole(event.target.value)}>{user.roles.map((role) => <option value={role} key={role}>{role.replaceAll('_', ' ')}</option>)}</select></label>}<small>{user.role.replaceAll('_', ' ')}</small>{user.id.startsWith('tic:') && <button type="button" onClick={() => setProfileEditing(true)}>Edit profile</button>}{providerManagesPassword ? <p>Password managed by Microsoft.</p> : <button type="button" onClick={() => { setProfileOpen(false); setPasswordOpen(true); }}>Change password</button>}</>}</div>}
        <button className="sidebar-logout" onClick={() => void logout()}><IconLogout size={18} /><span>Log out</span></button>
      </div>
    </aside>
    {navigationOpen && <button className="sidebar-backdrop" type="button" aria-label="Close navigation" onClick={() => setNavigationOpen(false)} />}
    <header className="mobile-header"><button className="mobile-menu-toggle" type="button" aria-label={navigationOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={navigationOpen} aria-controls="primary-sidebar" onClick={() => setNavigationOpen((open) => !open)}>{navigationOpen ? <IconX size={21} /> : <IconMenu2 size={21} />}</button><Link className="mobile-brand" href="/dashboard" aria-label="GVI Ticketing System home"><span>G</span><strong>GVI Ticketing</strong></Link><div className="mobile-account"><span>{user.name}</span><button type="button" onClick={() => void logout()} aria-label="Log out"><IconLogout size={18} /></button></div></header>
    <main className="portal-main">{children}</main>
    <PageHelp pathname={pathname} />
    {welcomeOpen && !user.mustChangePassword && <div className="modal-backdrop"><section className="modal welcome-modal" role="dialog" aria-modal="true" aria-labelledby="welcome-title"><p className="eyebrow">Welcome to GVI Ticketing</p><h2 id="welcome-title">Everything you need in one place</h2><p>Submit and track requests, follow each approval step, and use the question button whenever you need page-specific guidance.</p><ol><li>Open <strong>My requests</strong> to view your tickets or create a new one.</li><li>Choose the correct service and department, then complete the required fields.</li><li>Track progress and remarks from your request details.</li></ol><div className="modal-actions"><button className="primary" type="button" onClick={closeWelcome}>Start using the system</button></div></section></div>}
    {(passwordOpen || user.mustChangePassword) && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="password-title"><h2 id="password-title">Change password</h2><p>{user.mustChangePassword ? 'Set a new password before continuing.' : 'Use at least 12 characters with uppercase, lowercase, and a number.'}</p>{passwordError && <div className="alert">{passwordError}</div>}<label>New password<input type="password" minLength={12} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><div className="modal-actions">{!user.mustChangePassword && <button className="secondary" onClick={() => setPasswordOpen(false)}>Cancel</button>}<button className="primary" disabled={password.length < 12} onClick={() => void changePassword()}>Update password</button></div></section></div>}
  </div>;
}
