'use client';

import { IconEye, IconPencil, IconRefresh, IconUserPlus } from '@tabler/icons-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Pagination } from '@/components/Pagination';
import { roleLabel } from '@/lib/access-control';
import { api } from '@/lib/api';
import { useAuth } from '@/features/auth/AuthProvider';
import type { ManagedUser, PaginationMeta, Role, RoleOption } from '@/lib/types';

type UserSource = 'tic' | 'act';
type UserDraft = {
  firstName: string; middleName: string; lastName: string; email: string;
  password: string; confirmPassword: string; role: Role; roles: Role[];
  organizationType: string; organizationName: string;
};
type ModalState = { mode: 'create' } | { mode: 'view' | 'edit'; user: ManagedUser } | null;
type GuestRegistration = { id: string; email: string; name: string; companyName: string | null; businessUnitName: string | null; approvalStatus: 'pending'; createdAt: string };

const emptyDraft: UserDraft = {
  firstName: '', middleName: '', lastName: '', email: '', password: '', confirmPassword: '',
  role: 'requester', roles: ['requester'], organizationType: 'gvi', organizationName: '',
};
const initialMeta: PaginationMeta = { page: 1, pageSize: 20, total: 0, totalPages: 1 };
const externalOrganizations = new Set(['agency', 'outsource', 'third_party']);

function assignedRoles(user: ManagedUser): Role[] {
  return user.roles?.length ? user.roles : [user.role];
}

function organizationLabel(user: ManagedUser): string {
  return user.organizationName || user.organizationType?.replaceAll('_', ' ').toUpperCase() || 'Not specified';
}

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);
  const [source, setSource] = useState<UserSource>('tic');
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState(initialMeta);
  const [modal, setModal] = useState<ModalState>(null);
  const [draft, setDraft] = useState<UserDraft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [registrations, setRegistrations] = useState<GuestRegistration[]>([]);

  const load = useCallback(
    () => api.get<{ data: ManagedUser[]; meta: PaginationMeta }>(`/${source === 'tic' ? 'users' : 'act-identities'}?page=${page}&pageSize=20`),
    [page, source],
  );

  useEffect(() => {
    let active = true;
    void load()
      .then((result) => {
        if (!active) return;
        setUsers(result.data); setMeta(result.meta); setError('');
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Unable to load users');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load]);

  useEffect(() => {
    let active = true;
    void api.get<{ data: RoleOption[] }>('/roles')
      .then((response) => { if (active) setRoleOptions(response.data); })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Unable to load roles');
      });
    return () => { active = false; };
  }, []);

  const loadRegistrations = useCallback(async () => {
    if (currentUser?.role !== 'admin') return;
    const response = await api.get<{ data: GuestRegistration[] }>('/registration-requests?page=1&pageSize=50');
    setRegistrations(response.data);
  }, [currentUser?.role]);

  useEffect(() => { void loadRegistrations().catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to load registration requests')); }, [loadRegistrations]);

  const reviewRegistration = async (registration: GuestRegistration, action: 'approve' | 'reject') => {
    setError('');
    try {
      await api.patch(`/registration-requests/${registration.id}`, { action });
      await Promise.all([loadRegistrations(), refresh()]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to review this registration'); }
  };

  const refresh = async () => {
    setLoading(true);
    try {
      const result = await load();
      setUsers(result.data); setMeta(result.meta); setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to refresh users');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => { setError(''); setDraft(emptyDraft); setModal({ mode: 'create' }); };
  const openEdit = (user: ManagedUser) => {
    const roles = assignedRoles(user);
    setError('');
    setDraft({
      firstName: user.firstName || '', middleName: user.middleName || '', lastName: user.lastName || '',
      email: user.email, password: '', confirmPassword: '', role: user.role, roles,
      organizationType: user.organizationType || 'gvi', organizationName: user.organizationName || '',
    });
    setModal({ mode: 'edit', user });
  };

  const saveUser = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.roles.length) { setError('Select at least one role for this account.'); return; }
    if (modal?.mode === 'edit' && draft.password !== draft.confirmPassword) {
      setError('The new passwords do not match.'); return;
    }
    setSaving(true); setError('');
    try {
      if (modal?.mode === 'create') await api.post('/users', draft);
      if (modal?.mode === 'edit') {
        const { password, confirmPassword: _confirmPassword, ...update } = draft;
        void _confirmPassword;
        await api.patch(`/users/${modal.user.id}`, update);
        if (password) await api.post(`/users/${modal.user.id}/reset-password`, { password });
      }
      setModal(null);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save this user');
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (user: ManagedUser) => {
    setError('');
    try {
      await api.patch(`/users/${user.id}/active`, { active: !user.active });
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update the account status');
    }
  };

  const toggleRole = (role: Role, checked: boolean) => {
    const roles = checked ? [...new Set([...draft.roles, role])] : draft.roles.filter((item) => item !== role);
    if (!roles.length) { setError('Each account must have at least one role.'); return; }
    setError('');
    setDraft({ ...draft, roles, role: roles.includes(draft.role) ? draft.role : roles[0] });
  };

  const rolesForDraft = roleOptions.some((option) => option.role === draft.role)
    ? roleOptions
    : [{ role: draft.role, label: `${roleLabel(draft.role, roleOptions)} (inactive)`, description: '', system: false }, ...roleOptions];

  return <>
    <header className="page-header">
      <div><p className="eyebrow">Administration</p><h1>Users</h1><p>Manage ticketing accounts, organizations, and assigned roles.</p></div>
      <div className="page-actions">
        <button type="button" className="secondary" title="Refresh users" onClick={() => void refresh()} disabled={loading}><IconRefresh size={17} /> Refresh</button>
        {source === 'tic' && <button type="button" className="primary" onClick={openCreate}><IconUserPlus size={17} /> Create user</button>}
      </div>
    </header>
    {error && <div className="alert" role="alert">{error}</div>}

    {currentUser?.role === 'admin' && registrations.length > 0 && <section className="surface users-table-surface registration-review-surface">
      <div className="surface-toolbar"><div><h2>Pending Microsoft registrations</h2><small>{registrations.length} awaiting review</small></div></div>
      <div className="users-table-scroll"><table className="users-table"><thead><tr><th>Name</th><th>Email</th><th>Company</th><th>Business unit</th><th>Submitted</th><th>Actions</th></tr></thead><tbody>{registrations.map((registration) => <tr key={registration.id}><td><strong>{registration.name}</strong></td><td>{registration.email}</td><td>{registration.companyName || 'Not provided'}</td><td>{registration.businessUnitName || 'Not provided'}</td><td>{new Date(registration.createdAt).toLocaleString()}</td><td><div className="table-actions"><button type="button" className="primary compact" onClick={() => void reviewRegistration(registration, 'approve')}>Approve</button><button type="button" className="danger compact" onClick={() => void reviewRegistration(registration, 'reject')}>Reject</button></div></td></tr>)}</tbody></table></div>
    </section>}

    <section className="surface users-table-surface">
      <div className="surface-toolbar">
        <div><h2>{source === 'tic' ? 'Ticketing accounts' : 'ACT identities'}</h2><small>{meta.total} accounts</small></div>
        <div className="segmented">
          <button type="button" className={source === 'tic' ? 'selected' : ''} onClick={() => { setLoading(true); setSource('tic'); setPage(1); }}>Ticketing accounts</button>
          <button type="button" className={source === 'act' ? 'selected' : ''} onClick={() => { setLoading(true); setSource('act'); setPage(1); }}>ACT identities</button>
        </div>
      </div>
      <div className="users-table-scroll"><table className="users-table">
        <thead><tr><th>Name</th><th>Email</th><th>Organization</th><th>Roles</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {!loading && users.length === 0 && <tr><td colSpan={6} className="table-empty">No users found.</td></tr>}
          {users.map((user) => <tr key={user.id}>
            <td><strong>{user.name}</strong></td><td>{user.email}</td><td>{organizationLabel(user)}</td>
            <td>{assignedRoles(user).map((role) => roleLabel(role, roleOptions)).join(', ')}</td>
            <td><span className={`status ${user.active ? 'completed' : 'rejected'}`}>{user.active ? 'Active' : 'Inactive'}</span></td>
            <td><div className="table-actions">
              <button type="button" className="secondary compact" onClick={() => setModal({ mode: 'view', user })}><IconEye size={15} /> View</button>
              {source === 'tic' && <><button type="button" className="secondary compact" onClick={() => openEdit(user)}><IconPencil size={15} /> Edit</button>
                <button type="button" className={user.active ? 'danger compact' : 'secondary compact'} onClick={() => void setActive(user)}>{user.active ? 'Deactivate' : 'Restore'}</button></>}
            </div></td>
          </tr>)}
        </tbody>
      </table></div>
      <Pagination meta={meta} disabled={loading} onPageChange={(nextPage) => { setLoading(true); setPage(nextPage); }} />
    </section>

    {modal && <div className="modal-backdrop" onMouseDown={() => setModal(null)}><section className="modal user-modal" role="dialog" aria-modal="true" aria-labelledby="user-modal-title" onMouseDown={(event) => event.stopPropagation()}>
      <button type="button" className="modal-close" aria-label="Close" onClick={() => setModal(null)}>×</button>
      {modal.mode === 'view' ? <UserDetails user={modal.user} roleOptions={roleOptions} /> : <form onSubmit={saveUser}>
        <p className="eyebrow">{modal.mode === 'create' ? 'New account' : 'Update account'}</p><h2 id="user-modal-title">{modal.mode === 'create' ? 'Create user' : 'Edit user'}</h2>
        <div className="name-fields">
          <label>First name<input required maxLength={100} autoComplete="given-name" value={draft.firstName} onChange={(event) => setDraft({ ...draft, firstName: event.target.value })} /></label>
          <label>Middle name <small>Optional</small><input maxLength={100} autoComplete="additional-name" value={draft.middleName} onChange={(event) => setDraft({ ...draft, middleName: event.target.value })} /></label>
          <label>Last name<input required maxLength={100} autoComplete="family-name" value={draft.lastName} onChange={(event) => setDraft({ ...draft, lastName: event.target.value })} /></label>
        </div>
        <label>Email<input required type="email" autoComplete="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></label>
        {modal.mode === 'create' ? <label>Temporary password<input required minLength={12} type="password" autoComplete="new-password" value={draft.password} onChange={(event) => setDraft({ ...draft, password: event.target.value })} /><small>Use at least 12 characters with uppercase, lowercase, and a number.</small></label>
          : <fieldset className="password-reset-fields"><legend>Change password <small>Optional</small></legend><p>Set a temporary password only when the user needs a reset.</p><div>
              <label>New temporary password<input minLength={12} type="password" autoComplete="new-password" value={draft.password} onChange={(event) => setDraft({ ...draft, password: event.target.value })} /></label>
              <label>Confirm new password<input minLength={12} type="password" autoComplete="new-password" required={Boolean(draft.password)} value={draft.confirmPassword} onChange={(event) => setDraft({ ...draft, confirmPassword: event.target.value })} /></label>
            </div></fieldset>}
        <fieldset className="role-assignment"><legend>Assigned roles</legend><p>Select every role this account may use.</p><div>{rolesForDraft.map((option) => <label className="check" key={option.role}>
          <input type="checkbox" checked={draft.roles.includes(option.role)} onChange={(event) => toggleRole(option.role, event.target.checked)} />{option.label}
        </label>)}</div></fieldset>
        <div className="organization-fields">
          <label>Organization type<select value={draft.organizationType} onChange={(event) => setDraft({ ...draft, organizationType: event.target.value })}>
            <option value="gvi">GVI</option><option value="gve">GVE</option><option value="huli">HULI</option><option value="affiliate">Affiliate</option><option value="agency">Agency</option><option value="outsource">Outsource</option><option value="third_party">Third party</option>
          </select></label>
          <label>Organization name<input required={externalOrganizations.has(draft.organizationType)} maxLength={150} value={draft.organizationName} onChange={(event) => setDraft({ ...draft, organizationName: event.target.value })} /><small>Required for agencies, outsourced teams, and third parties.</small></label>
        </div>
        <div className="modal-actions"><button type="button" className="secondary" onClick={() => setModal(null)}>Cancel</button><button type="submit" className="primary" disabled={saving || roleOptions.length === 0}>{saving ? 'Saving…' : modal.mode === 'create' ? 'Create user' : 'Save changes'}</button></div>
      </form>}
    </section></div>}
  </>;
}

function UserDetails({ user, roleOptions }: { user: ManagedUser; roleOptions: RoleOption[] }) {
  return <><p className="eyebrow">User details</p><h2 id="user-modal-title">{user.name}</h2><dl className="user-details">
    <div><dt>First name</dt><dd>{user.firstName || 'Not provided'}</dd></div><div><dt>Middle name</dt><dd>{user.middleName || 'Not provided'}</dd></div>
    <div><dt>Last name</dt><dd>{user.lastName || 'Not provided'}</dd></div><div><dt>Email</dt><dd>{user.email}</dd></div>
    <div><dt>Organization</dt><dd>{organizationLabel(user)}</dd></div><div><dt>Roles</dt><dd>{assignedRoles(user).map((role) => roleLabel(role, roleOptions)).join(', ')}</dd></div>
    <div><dt>Status</dt><dd>{user.active ? 'Active' : 'Inactive'}</dd></div><div><dt>Created</dt><dd>{new Date(user.createdAt).toLocaleString()}</dd></div>
    <div><dt>Last updated</dt><dd>{new Date(user.updatedAt).toLocaleString()}</dd></div>
  </dl></>;
}
