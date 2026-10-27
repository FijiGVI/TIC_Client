'use client';

import { IconSearch, IconUserPlus, IconUsers } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import type { Role, User } from '@/lib/types';

const emptyUser = { name: '', email: '', password: '', role: 'requester' as Role, active: true };
const roleLabels: Record<Role, string> = { admin: 'Administrator', request_manager: 'Request manager', approver: 'Approver', requester: 'Requester' };

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState(emptyUser);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const response = await api.get<{ data: User[] }>('/users'); setUsers(response.data); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load users'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return users.filter((user) => !normalized || user.name.toLowerCase().includes(normalized) || user.email.toLowerCase().includes(normalized) || roleLabels[user.role].toLowerCase().includes(normalized));
  }, [query, users]);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('');
    try { await api.post('/users', form); setForm(emptyUser); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to create user'); }
    finally { setSaving(false); }
  };

  const updateRole = async (user: User, role: Role) => {
    setUpdatingId(user.id); setError('');
    try { await api.patch(`/users/${user.id}`, { role }); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to update role'); }
    finally { setUpdatingId(null); }
  };

  return (
    <>
      <header className="page-header"><div><p className="eyebrow">Administration</p><h1>Users & roles</h1><p>Invite team members and keep access aligned with their responsibilities.</p></div></header>
      {error && <div className="alert" role="alert">{error}</div>}
      <div className="admin-grid users-layout">
        <section className="surface">
          <div className="surface-toolbar users-toolbar"><div><h2>Team directory</h2><small>{users.length} {users.length === 1 ? 'user' : 'users'}</small></div><label className="search"><IconSearch size={18} /><input aria-label="Search users" placeholder="Search name, email, or role" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
          <div className="user-list">
            {loading && !users.length && <div className="empty"><div className="spinner" /><h3>Loading team</h3></div>}
            {!loading && filteredUsers.map((user) => <div className="user-row" key={user.id}><span className="avatar">{user.name[0]}</span><div className="user-identity"><strong>{user.name}</strong><small>{user.email}</small></div><span className={`role-badge ${user.role}`}>{roleLabels[user.role]}</span><select aria-label={`Role for ${user.name}`} disabled={updatingId === user.id} value={user.role} onChange={(event) => void updateRole(user, event.target.value as Role)}>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>)}
            {!loading && !filteredUsers.length && <div className="empty"><IconUsers size={34} /><h3>No users found</h3><p>Try a different search.</p></div>}
          </div>
        </section>
        <section className="surface editor invite-card">
          <div className="editor-heading"><span><IconUserPlus size={21} /></span><div><h2>Add team member</h2><p>They’ll be prompted to change this temporary password.</p></div></div>
          <form onSubmit={submit}>
            <label>Full name<input required autoComplete="off" placeholder="e.g. Maria Santos" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
            <label>Work email<input required type="email" autoComplete="off" placeholder="name@company.com" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
            <label>Temporary password<input required minLength={12} type="password" autoComplete="new-password" placeholder="At least 12 characters" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /><small>Use uppercase, lowercase, and a number.</small></label>
            <label>Access role<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as Role })}>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <button className="primary full-width" disabled={saving}>{saving ? 'Creating user…' : <><IconUserPlus size={18} />Create user</>}</button>
          </form>
        </section>
      </div>
    </>
  );
}
