'use client';

import { IconDeviceFloppy, IconEye, IconPencil, IconPlus, IconRefresh, IconShieldLock, IconTrash } from '@tabler/icons-react';
import { FormEvent, KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Pagination } from '@/components/Pagination';
import { permissionDetails } from '@/lib/access-control';
import { api } from '@/lib/api';
import type { Role, RolePermissionSet, TicPermission } from '@/lib/types';

const PAGE_SIZE = 8;
type RoleDraft = { role: string; label: string; description: string };
type RoleModal = { mode: 'create' } | { mode: 'view' | 'edit' | 'delete'; role: RolePermissionSet } | null;
type RolesTab = 'roles' | 'permissions';
const emptyDraft: RoleDraft = { role: '', label: '', description: '' };
const roleKeyFromLabel = (label: string) => label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);

export default function RolesPage() {
  const [matrix, setMatrix] = useState<RolePermissionSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRole, setSavingRole] = useState<Role | null>(null);
  const [savedRole, setSavedRole] = useState<Role | null>(null);
  const [modal, setModal] = useState<RoleModal>(null);
  const [draft, setDraft] = useState<RoleDraft>(emptyDraft);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<RolesTab>('roles');
  const totalPages = Math.max(1, Math.ceil(permissionDetails.length / PAGE_SIZE));
  const visiblePermissions = permissionDetails.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const activeRoles = useMemo(() => matrix.filter((role) => role.active), [matrix]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get<{ data: RolePermissionSet[] }>('/roles/permissions');
      setMatrix(response.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load roles and permissions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Loading is intentionally initiated when the page is mounted.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const openCreate = () => { setDraft(emptyDraft); setModal({ mode: 'create' }); };
  const openEdit = (role: RolePermissionSet) => {
    setDraft({ role: role.role, label: role.label, description: role.description });
    setModal({ mode: 'edit', role });
  };
  const updateDraftLabel = (label: string) => setDraft((current) => ({
    ...current,
    label,
    role: modal?.mode === 'create' ? roleKeyFromLabel(label) : current.role,
  }));

  const saveRoleDetails = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      if (modal?.mode === 'create') await api.post('/roles', { ...draft, permissions: [] });
      if (modal?.mode === 'edit') await api.patch(`/roles/${modal.role.role}`, { label: draft.label, description: draft.description });
      setModal(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save role');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (role: RolePermissionSet) => {
    setError('');
    try {
      await api.patch(`/roles/${role.role}`, { active: !role.active });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update role status');
    }
  };

  const deleteRole = async () => {
    if (modal?.mode !== 'delete') return;
    setSubmitting(true);
    setError('');
    try {
      await api.delete(`/roles/${modal.role.role}`);
      setModal(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to delete role');
    } finally {
      setSubmitting(false);
    }
  };

  const togglePermission = (role: Role, permission: TicPermission) => {
    setSavedRole(null);
    setMatrix((current) => current.map((entry) => entry.role !== role ? entry : {
      ...entry,
      permissions: entry.permissions.includes(permission)
        ? entry.permissions.filter((item) => item !== permission)
        : [...entry.permissions, permission],
    }));
  };

  const savePermissions = async (role: Role) => {
    const entry = matrix.find((item) => item.role === role);
    if (!entry) return;
    setSavingRole(role);
    setSavedRole(null);
    setError('');
    try {
      await api.put(`/roles/${role}/permissions`, { permissions: entry.permissions });
      setSavedRole(role);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `Unable to save ${entry.label}`);
    } finally {
      setSavingRole(null);
    }
  };

  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const nextTab: RolesTab = event.key === 'ArrowLeft' || event.key === 'Home' ? 'roles' : 'permissions';
    setActiveTab(nextTab);
    window.requestAnimationFrame(() => document.getElementById(`${nextTab}-tab`)?.focus());
  };

  return <>
    <header className="page-header"><div><p className="eyebrow">Administration</p><h1>Roles & permissions</h1><p>Create roles, control access, and choose what each role can do.</p></div><div className="page-actions"><button className="secondary" type="button" title="Reload roles and permissions" onClick={() => void load()} disabled={loading}><IconRefresh size={17}/> Refresh</button>{activeTab === 'roles' && <button className="primary" type="button" onClick={openCreate}><IconPlus size={18}/> Create role</button>}</div></header>
    {error && <div className="alert" role="alert">{error}</div>}

    <nav className="role-tabs" role="tablist" aria-label="Roles and permissions sections">
      <button type="button" role="tab" id="roles-tab" aria-selected={activeTab === 'roles'} aria-controls="roles-panel" tabIndex={activeTab === 'roles' ? 0 : -1} onClick={() => setActiveTab('roles')} onKeyDown={handleTabKeyDown}><span>Role directory</span><small>{matrix.length} roles</small></button>
      <button type="button" role="tab" id="permissions-tab" aria-selected={activeTab === 'permissions'} aria-controls="permissions-panel" tabIndex={activeTab === 'permissions' ? 0 : -1} onClick={() => setActiveTab('permissions')} onKeyDown={handleTabKeyDown}><span>Permission matrix</span><small>{permissionDetails.length} permissions</small></button>
    </nav>

    {activeTab === 'roles' && <section id="roles-panel" role="tabpanel" aria-labelledby="roles-tab" className="surface users-table-surface role-catalog" aria-busy={loading}>
      <div className="surface-toolbar"><div><h2>Role directory</h2><small>{activeRoles.length} active of {matrix.length} roles</small></div></div>
      <div className="users-table-scroll"><table className="users-table role-directory-table"><thead><tr><th>Role</th><th>Key</th><th>Status</th><th>Type</th><th>Permissions</th><th>Actions</th></tr></thead><tbody>
        {!loading && matrix.length === 0 && <tr><td colSpan={6} className="table-empty">No roles found.</td></tr>}
        {matrix.map((role) => <tr key={role.role}><td><strong>{role.label}</strong><small>{role.description || 'No description provided.'}</small></td><td><code>{role.role}</code></td><td><span className={`status ${role.active ? 'completed' : 'rejected'}`}>{role.active ? 'Active' : 'Inactive'}</span></td><td>{role.system ? 'System' : 'Custom'}</td><td>{role.permissions.length}</td><td><div className="table-actions"><button type="button" className="secondary compact" onClick={() => setModal({ mode: 'view', role })}><IconEye size={15}/> View</button><button type="button" className="secondary compact" onClick={() => openEdit(role)}><IconPencil size={15}/> Edit</button><button type="button" className="secondary compact" disabled={role.system || loading} title={role.system ? 'System roles must remain active' : undefined} onClick={() => void toggleActive(role)}>{role.active ? 'Deactivate' : 'Activate'}</button>{!role.system && <button type="button" className="danger compact" onClick={() => setModal({ mode: 'delete', role })}><IconTrash size={15}/> Delete</button>}</div></td></tr>)}
      </tbody></table></div>
    </section>}

    {activeTab === 'permissions' && <div id="permissions-panel" role="tabpanel" aria-labelledby="permissions-tab" className="permission-tab-panel">
    <div className="role-guidance notice" role="note"><IconShieldLock size={20}/><div><strong>Permissions apply to everyone assigned to that role.</strong><span>Save each role after changing its permissions. System roles cannot be deleted or deactivated.</span></div></div>
    <section className="surface roles-table-surface" aria-busy={loading}>
      <div className="surface-toolbar"><div><h2>Permission matrix</h2><small>Compare and update access by role</small></div></div>
      <div className="roles-table-scroll"><table className="roles-table"><thead><tr><th scope="col">Permission</th>{matrix.map((role) => <th scope="col" key={role.role} className={!role.active ? 'inactive-role' : ''}><strong>{role.label}</strong><small>{role.permissions.length} enabled{!role.active ? ' · inactive' : ''}</small></th>)}</tr></thead><tbody>
        {visiblePermissions.map((permission, index) => <tr key={permission.value} className={index === 0 || visiblePermissions[index - 1].group !== permission.group ? 'group-start' : ''}><th scope="row"><span>{permission.group}</span><strong>{permission.label}</strong><small>{permission.description}</small></th>{matrix.map((role) => <td key={role.role} className={!role.active ? 'inactive-role' : ''}><label><input type="checkbox" disabled={loading || savingRole !== null} checked={role.permissions.includes(permission.value)} onChange={() => togglePermission(role.role, permission.value)}/><span className="sr-only">Allow {role.label} to {permission.label.toLowerCase()}</span></label></td>)}</tr>)}
      </tbody><tfoot><tr><th scope="row">Save changes</th>{matrix.map((role) => <td key={role.role} className={!role.active ? 'inactive-role' : ''}><button className="secondary compact" type="button" disabled={savingRole !== null} onClick={() => void savePermissions(role.role)}><IconDeviceFloppy size={15}/>{savingRole === role.role ? 'Saving…' : 'Save'}<span className="sr-only"> {role.label}</span></button><small role="status">{savedRole === role.role ? 'Saved' : ''}</small></td>)}</tr></tfoot></table></div>
      <Pagination meta={{ page, pageSize: PAGE_SIZE, total: permissionDetails.length, totalPages }} disabled={loading || savingRole !== null} onPageChange={setPage}/>
    </section>
    </div>}

    {modal && <div className="modal-backdrop" onMouseDown={() => setModal(null)}><section className="modal role-modal" role="dialog" aria-modal="true" aria-labelledby="role-modal-title" onMouseDown={(event) => event.stopPropagation()}><button type="button" className="modal-close" aria-label="Close" onClick={() => setModal(null)}>×</button>
      {modal.mode === 'view' && <><p className="eyebrow">Role details</p><h2 id="role-modal-title">{modal.role.label}</h2><p>{modal.role.description || 'No description provided.'}</p><dl className="user-details"><div><dt>Role key</dt><dd><code>{modal.role.role}</code></dd></div><div><dt>Status</dt><dd>{modal.role.active ? 'Active' : 'Inactive'}</dd></div><div><dt>Type</dt><dd>{modal.role.system ? 'System role' : 'Custom role'}</dd></div><div><dt>Permissions</dt><dd>{modal.role.permissions.length} enabled</dd></div><div><dt>Created</dt><dd>{modal.role.createdAt ? new Date(modal.role.createdAt).toLocaleString() : 'Not available'}</dd></div><div><dt>Last updated</dt><dd>{modal.role.updatedAt ? new Date(modal.role.updatedAt).toLocaleString() : 'Not available'}</dd></div></dl></>}
      {(modal.mode === 'create' || modal.mode === 'edit') && <form onSubmit={saveRoleDetails}><p className="eyebrow">{modal.mode === 'create' ? 'New role' : 'Update role'}</p><h2 id="role-modal-title">{modal.mode === 'create' ? 'Create role' : `Edit ${modal.role.label}`}</h2><p className="modal-intro">Use a clear name and description so administrators know when to assign this role.</p><label>Role name<input required maxLength={100} autoFocus value={draft.label} onChange={(event) => updateDraftLabel(event.target.value)}/></label><label>Role key<input required readOnly={modal.mode === 'edit'} pattern="[a-z][a-z0-9_]{1,39}" maxLength={40} value={draft.role} onChange={(event) => setDraft({...draft, role: roleKeyFromLabel(event.target.value)})}/><small>{modal.mode === 'edit' ? 'The key is permanent so existing assignments remain valid.' : 'Generated automatically. Use lowercase letters, numbers, and underscores.'}</small></label><label>Description<textarea maxLength={500} value={draft.description} onChange={(event) => setDraft({...draft, description: event.target.value})}/></label><div className="modal-actions"><button type="button" className="secondary" onClick={() => setModal(null)}>Cancel</button><button type="submit" className="primary" disabled={submitting}>{submitting ? 'Saving…' : modal.mode === 'create' ? 'Create role' : 'Save changes'}</button></div></form>}
      {modal.mode === 'delete' && <><p className="eyebrow">Delete custom role</p><h2 id="role-modal-title">Delete {modal.role.label}?</h2><p>This permanently removes the role. It can only be deleted when it is no longer assigned to any user, form, or workflow step.</p><div className="modal-actions"><button type="button" className="secondary" onClick={() => setModal(null)}>Cancel</button><button type="button" className="danger" disabled={submitting} onClick={() => void deleteRole()}>{submitting ? 'Deleting…' : 'Delete role'}</button></div></>}
    </section></div>}
  </>;
}
