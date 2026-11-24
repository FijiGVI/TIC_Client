'use client';

import { IconChevronLeft, IconChevronRight, IconClipboardList, IconDatabaseImport, IconForms, IconHistory, IconLayoutDashboard, IconLogout, IconMenu2, IconSettings, IconShieldLock, IconUsers, IconX } from '@tabler/icons-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { actApi, api } from '@/lib/api';
import { PageHelp } from '@/components/PageHelp';
import hrLogo from '@/assets/logo/Logo_HR.png';

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

  useEffect(() => {
    if (!profileOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setProfileOpen(false); };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [profileOpen]);

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
    setProfileError('');
    try { await api.patch('/profile', { name: profileName, email: profileEmail }); await refreshUser(); setProfileEditing(false); }
    catch (reason) { setProfileError(reason instanceof Error ? reason.message : 'Unable to update profile'); }
  };

  const openProfile = () => {
    setProfileName(user?.name || '');
    setProfileEmail(user?.email || '');
    setProfileError('');
    setProfileEditing(false);
    setProfileOpen(true);
  };

  const closeProfile = () => {
    setProfileOpen(false);
    setProfileEditing(false);
    setProfileError('');
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
  const providerManagesPassword = user.authMethod === 'microsoft';

  return <div className={`portal ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
    <aside className={`sidebar ${navigationOpen ? 'mobile-open' : ''}`} id="primary-sidebar">
      <div className="brand"><span className="brand-logo-shell"><Image src={hrLogo} alt="" priority /></span><div><strong>GVI Ticketing</strong><small>Employee Services</small></div></div>
      <button className="sidebar-collapse" type="button" aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setSidebarCollapsed((value) => !value)}>{sidebarCollapsed ? <IconChevronRight size={18} /> : <IconChevronLeft size={18} />}</button>
      <nav aria-label="Primary navigation">{links.map(({ href, label, icon: Icon }) => <Link className={pathname === href ? 'active' : ''} href={href} key={href} title={sidebarCollapsed ? label : undefined} aria-current={pathname === href ? 'page' : undefined} onClick={() => setNavigationOpen(false)}><Icon size={20} /><span>{label}</span></Link>)}</nav>
      <div className="sidebar-user">
        <span>{user.name.slice(0, 1).toUpperCase()}</span><div><strong>{user.name}</strong><small>{user.role.replace('_', ' ')}</small></div>
        <button aria-label="Open account settings" title="Account settings" aria-expanded={profileOpen} onClick={openProfile}>•••</button>
        <button className="sidebar-logout" onClick={() => void logout()}><IconLogout size={18} /><span>Log out</span></button>
      </div>
    </aside>
    {navigationOpen && <button className="sidebar-backdrop" type="button" aria-label="Close navigation" onClick={() => setNavigationOpen(false)} />}
    <header className="mobile-header"><button className="mobile-menu-toggle" type="button" aria-label={navigationOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={navigationOpen} aria-controls="primary-sidebar" onClick={() => setNavigationOpen((open) => !open)}>{navigationOpen ? <IconX size={21} /> : <IconMenu2 size={21} />}</button><Link className="mobile-brand" href="/dashboard" aria-label="GVI Ticketing System home"><span className="brand-logo-shell"><Image src={hrLogo} alt="" priority /></span><strong>GVI Ticketing</strong></Link><div className="mobile-account"><button className="mobile-profile-trigger" type="button" onClick={openProfile} aria-label="Open account settings">{user.name}</button><button type="button" onClick={() => void logout()} aria-label="Log out"><IconLogout size={18} /></button></div></header>
    <main className="portal-main">{children}</main>
    <PageHelp pathname={pathname} />
    {profileOpen && <div className="modal-backdrop account-dialog-backdrop" onMouseDown={closeProfile}><section className="modal account-dialog" role="dialog" aria-modal="true" aria-labelledby="account-dialog-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" type="button" aria-label="Close account settings" onClick={closeProfile}><IconX size={21}/></button><header className="account-dialog-header"><span>{user.name.slice(0, 1).toUpperCase()}</span><div><p className="eyebrow">Account settings</p><h2 id="account-dialog-title">{profileEditing ? 'Edit your profile' : user.name}</h2><p>{profileEditing ? 'Update the contact information used by TIC.' : user.email}</p></div></header>{profileError && <div className="alert" role="alert">{profileError}</div>}{profileEditing ? <form onSubmit={(event) => { event.preventDefault(); void saveProfile(); }}><label>Name<input value={profileName} maxLength={200} required autoComplete="name" onChange={(event) => setProfileName(event.target.value)} /></label><label>Email<input type="email" value={profileEmail} maxLength={254} required autoComplete="email" onChange={(event) => setProfileEmail(event.target.value)} /></label><div className="modal-actions"><button className="secondary" type="button" onClick={() => { setProfileEditing(false); setProfileError(''); }}>Cancel</button><button className="primary" type="submit">Save profile</button></div></form> : <><dl className="account-details"><div><dt>Organization</dt><dd>{user.organizationName || user.organizationType?.replaceAll('_', ' ') || 'Not assigned'}</dd></div><div><dt>Active role</dt><dd>{user.role.replaceAll('_', ' ')}</dd></div></dl>{user.roles.length > 1 && <label>Switch active role<select value={user.role} onChange={(event) => void changeActiveRole(event.target.value)}>{user.roles.map((role) => <option value={role} key={role}>{role.replaceAll('_', ' ')}</option>)}</select></label>}<div className="account-dialog-actions">{user.id.startsWith('tic:') && <button className="secondary" type="button" onClick={() => setProfileEditing(true)}>Edit profile</button>}{providerManagesPassword ? <p>Password managed by Microsoft.</p> : <button className="secondary" type="button" onClick={() => { closeProfile(); setPasswordOpen(true); }}>Change password</button>}<button className="account-logout" type="button" onClick={() => void logout()}><IconLogout size={18}/>Log out</button></div></>}</section></div>}
    {welcomeOpen && !user.mustChangePassword && <div className="modal-backdrop"><section className="modal welcome-modal" role="dialog" aria-modal="true" aria-labelledby="welcome-title"><p className="eyebrow">Welcome to GVI Ticketing</p><h2 id="welcome-title">Everything you need in one place</h2><p>Submit and track requests, follow each approval step, and use the question button whenever you need page-specific guidance.</p><ol><li>Open <strong>My requests</strong> to view your tickets or create a new one.</li><li>Choose the correct service and department, then complete the required fields.</li><li>Track progress and remarks from your request details.</li></ol><div className="modal-actions"><button className="primary" type="button" onClick={closeWelcome}>Start using the system</button></div></section></div>}
    {(passwordOpen || user.mustChangePassword) && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="password-title"><h2 id="password-title">Change password</h2><p>{user.mustChangePassword ? 'Set a new password before continuing.' : 'Use at least 12 characters with uppercase, lowercase, and a number.'}</p>{passwordError && <div className="alert">{passwordError}</div>}<label>New password<input type="password" minLength={12} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><div className="modal-actions">{!user.mustChangePassword && <button className="secondary" onClick={() => setPasswordOpen(false)}>Cancel</button>}<button className="primary" disabled={password.length < 12} onClick={() => void changePassword()}>Update password</button></div></section></div>}
  </div>;
}
