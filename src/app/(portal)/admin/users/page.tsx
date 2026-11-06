'use client';

import { IconEye, IconPencil, IconRefresh, IconUserPlus } from '@tabler/icons-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Pagination } from '@/components/Pagination';
import { roleDetails, roles } from '@/lib/access-control';
import { api } from '@/lib/api';
import type { ManagedUser, PaginationMeta, Role } from '@/lib/types';

type UserDraft = { firstName: string; middleName: string; lastName: string; email: string; password: string; confirmPassword: string; role: Role };
type ModalState = { mode: 'create' } | { mode: 'view' | 'edit'; user: ManagedUser } | null;
const emptyDraft: UserDraft = { firstName: '', middleName: '', lastName: '', email: '', password: '', confirmPassword: '', role: 'requester' };
const initialMeta: PaginationMeta = { page: 1, pageSize: 20, total: 0, totalPages: 1 };

export default function UsersPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [source, setSource] = useState<'tic' | 'act'>('tic');
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState(initialMeta);
  const [modal, setModal] = useState<ModalState>(null);
  const [draft, setDraft] = useState<UserDraft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    return api.get<{ data: ManagedUser[]; meta: PaginationMeta }>(`/${source === 'tic' ? 'users' : 'act-identities'}?page=${page}&pageSize=20`);
  }, [page, source]);

  useEffect(() => {
    let active = true;
    void load().then((result) => { if (active) { setUsers(result.data); setMeta(result.meta); setError(''); } })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load users'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load]);

  const openCreate = () => { setDraft(emptyDraft); setModal({ mode: 'create' }); };
  const openEdit = (user: ManagedUser) => {
    setDraft({ firstName: user.firstName || '', middleName: user.middleName || '', lastName: user.lastName || '', email: user.email, password: '', confirmPassword: '', role: user.role });
    setModal({ mode: 'edit', user });
  };
  const refresh = async () => { setLoading(true); const result = await load(); setUsers(result.data); setMeta(result.meta); setLoading(false); };

  const saveUser = async (event: FormEvent) => {
    event.preventDefault();
    if (modal?.mode === 'edit' && draft.password !== draft.confirmPassword) { setError('The new passwords do not match'); return; }
    setSaving(true); setError('');
    try {
      if (modal?.mode === 'create') await api.post('/users', draft);
      if (modal?.mode === 'edit') {
        const { password, confirmPassword: _confirmPassword, ...update } = draft;
        void _confirmPassword;
        await api.patch(`/users/${modal.user.id}`, update);
        if (password) await api.post(`/users/${modal.user.id}/reset-password`, { password });
      }
      setModal(null); await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save user'); }
    finally { setSaving(false); }
  };

  const setActive = async (user: ManagedUser) => {
    setError('');
    try { await api.patch(`/users/${user.id}/active`, { active: !user.active }); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to update account status'); }
  };

  return <>
    <header className="page-header"><div><p className="eyebrow">Administration</p><h1>Users</h1><p>View and manage ticketing accounts and their access.</p></div><div className="page-actions"><button type="button" className="secondary" title="Refresh users" onClick={() => void refresh()} disabled={loading}><IconRefresh size={17}/> Refresh</button>{source === 'tic' && <button type="button" className="primary" onClick={openCreate}><IconUserPlus size={17}/> Create user</button>}</div></header>
    {error && <div className="alert" role="alert">{error}</div>}
    <section className="surface users-table-surface">
      <div className="surface-toolbar"><div><h2>{source === 'tic' ? 'Ticketing accounts' : 'ACT identities'}</h2><small>{meta.total} accounts</small></div><div className="segmented"><button type="button" className={source === 'tic' ? 'selected' : ''} onClick={() => { setLoading(true); setSource('tic'); setPage(1); }}>Ticketing accounts</button><button type="button" className={source === 'act' ? 'selected' : ''} onClick={() => { setLoading(true); setSource('act'); setPage(1); }}>ACT identities</button></div></div>
      <div className="users-table-scroll"><table className="users-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last updated</th><th>Actions</th></tr></thead><tbody>
        {!loading && users.length === 0 && <tr><td colSpan={6} className="table-empty">No users found.</td></tr>}
        {users.map((user) => <tr key={user.id}><td><strong>{user.name}</strong></td><td>{user.email}</td><td>{roleDetails[user.role]?.label || user.role}</td><td><span className={`status ${user.active ? 'completed' : 'rejected'}`}>{user.active ? 'Active' : 'Inactive'}</span></td><td>{new Date(user.updatedAt).toLocaleString()}</td><td><div className="table-actions"><button type="button" className="secondary compact" onClick={() => setModal({ mode: 'view', user })}><IconEye size={15}/> View</button>{source === 'tic' && <><button type="button" className="secondary compact" onClick={() => openEdit(user)}><IconPencil size={15}/> Edit</button><button type="button" className={user.active ? 'danger compact' : 'secondary compact'} onClick={() => void setActive(user)}>{user.active ? 'Deactivate' : 'Restore'}</button></>}</div></td></tr>)}
      </tbody></table></div>
      <Pagination meta={meta} disabled={loading} onPageChange={(nextPage) => { setLoading(true); setPage(nextPage); }}/>
    </section>
    {modal && <div className="modal-backdrop" onMouseDown={() => setModal(null)}><section className="modal user-modal" role="dialog" aria-modal="true" aria-labelledby="user-modal-title" onMouseDown={(event) => event.stopPropagation()}><button type="button" className="modal-close" aria-label="Close" onClick={() => setModal(null)}>×</button>
      {modal.mode === 'view' ? <><p className="eyebrow">User details</p><h2 id="user-modal-title">{modal.user.name}</h2><dl className="user-details"><div><dt>First name</dt><dd>{modal.user.firstName || '—'}</dd></div><div><dt>Middle name</dt><dd>{modal.user.middleName || '—'}</dd></div><div><dt>Last name</dt><dd>{modal.user.lastName || '—'}</dd></div><div><dt>Email</dt><dd>{modal.user.email}</dd></div><div><dt>Role</dt><dd>{roleDetails[modal.user.role]?.label || modal.user.role}</dd></div><div><dt>Status</dt><dd>{modal.user.active ? 'Active' : 'Inactive'}</dd></div><div><dt>Created</dt><dd>{new Date(modal.user.createdAt).toLocaleString()}</dd></div><div><dt>Last updated</dt><dd>{new Date(modal.user.updatedAt).toLocaleString()}</dd></div></dl></> : <form onSubmit={saveUser}><p className="eyebrow">{modal.mode === 'create' ? 'New account' : 'Update account'}</p><h2 id="user-modal-title">{modal.mode === 'create' ? 'Create user' : 'Edit user'}</h2><div className="name-fields"><label>First name<input required maxLength={100} autoComplete="given-name" value={draft.firstName} onChange={(event) => setDraft({...draft,firstName:event.target.value})}/></label><label>Middle name <small>Optional</small><input maxLength={100} autoComplete="additional-name" value={draft.middleName} onChange={(event) => setDraft({...draft,middleName:event.target.value})}/></label><label>Last name<input required maxLength={100} autoComplete="family-name" value={draft.lastName} onChange={(event) => setDraft({...draft,lastName:event.target.value})}/></label></div><label>Email<input required type="email" autoComplete="email" value={draft.email} onChange={(event) => setDraft({...draft,email:event.target.value})}/></label>{modal.mode === 'create' ? <label>Temporary password<input required minLength={12} type="password" autoComplete="new-password" value={draft.password} onChange={(event) => setDraft({...draft,password:event.target.value})}/><small>12+ characters with uppercase, lowercase, and a number.</small></label> : <fieldset className="password-reset-fields"><legend>Change password <small>Optional</small></legend><p>Set a temporary password only when the user needs a reset. They must change it after their next login.</p><div><label>New temporary password<input minLength={12} type="password" autoComplete="new-password" value={draft.password} onChange={(event) => setDraft({...draft,password:event.target.value})}/></label><label>Confirm new password<input minLength={12} type="password" autoComplete="new-password" required={Boolean(draft.password)} value={draft.confirmPassword} onChange={(event) => setDraft({...draft,confirmPassword:event.target.value})}/></label></div></fieldset>}<label>Role<select value={draft.role} onChange={(event) => setDraft({...draft,role:event.target.value as Role})}>{roles.map((item) => <option key={item} value={item}>{roleDetails[item].label}</option>)}</select></label><div className="modal-actions"><button type="button" className="secondary" onClick={() => setModal(null)}>Cancel</button><button type="submit" className="primary" disabled={saving}>{saving ? 'Saving…' : modal.mode === 'create' ? 'Create user' : 'Save changes'}</button></div></form>}
    </section></div>}
  </>;
}
