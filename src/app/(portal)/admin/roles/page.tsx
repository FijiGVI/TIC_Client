'use client';

import { IconDeviceFloppy, IconRefresh, IconShieldLock } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { permissionDetails, roleDetails, roles } from '@/lib/access-control';
import { api } from '@/lib/api';
import type { Role, RolePermissionSet, TicPermission } from '@/lib/types';

export default function RolesPage() {
  const [matrix, setMatrix] = useState<RolePermissionSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRole, setSavingRole] = useState<Role | null>(null);
  const [savedRole, setSavedRole] = useState<Role | null>(null);
  const [error, setError] = useState('');

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

  const togglePermission = (role: Role, permission: TicPermission) => {
    setSavedRole(null);
    setMatrix((current) => current.map((entry) => entry.role !== role ? entry : {
      ...entry,
      permissions: entry.permissions.includes(permission)
        ? entry.permissions.filter((item) => item !== permission)
        : [...entry.permissions, permission],
    }));
  };

  const saveRole = async (role: Role) => {
    const entry = matrix.find((item) => item.role === role);
    if (!entry) return;
    setSavingRole(role);
    setSavedRole(null);
    setError('');
    try {
      await api.put(`/roles/${role}/permissions`, { permissions: entry.permissions });
      setSavedRole(role);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `Unable to save ${roleDetails[role].label}`);
    } finally {
      setSavingRole(null);
    }
  };

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>Roles & permissions</h1>
          <p>Choose what each role can see and do in TIC.</p>
        </div>
        <button className="secondary" type="button" onClick={() => void load()} disabled={loading}>
          <IconRefresh size={17} /> Refresh
        </button>
      </header>
      {error && <div className="alert" role="alert">{error}</div>}
      <div className="role-guidance notice" role="note">
        <IconShieldLock size={20} />
        <div><strong>Permissions apply to everyone with that role.</strong><span>Changes take effect after saving and may affect access immediately.</span></div>
      </div>
      <section className="surface roles-table-surface" aria-busy={loading}>
        <div className="roles-table-scroll">
          <table className="roles-table">
            <thead>
              <tr>
                <th scope="col">Permission</th>
                {roles.map((role) => {
                  const entry = matrix.find((item) => item.role === role);
                  return <th scope="col" key={role}><strong>{roleDetails[role].label}</strong><small>{entry?.permissions.length ?? 0} enabled</small></th>;
                })}
              </tr>
            </thead>
            <tbody>
              {permissionDetails.map((permission, index) => <tr key={permission.value} className={index === 0 || permissionDetails[index - 1].group !== permission.group ? 'group-start' : ''}>
                <th scope="row"><span>{permission.group}</span><strong>{permission.label}</strong><small>{permission.description}</small></th>
                {roles.map((role) => {
                  const entry = matrix.find((item) => item.role === role);
                  return <td key={role}><label><input type="checkbox" disabled={loading || !entry || savingRole !== null} checked={entry?.permissions.includes(permission.value) ?? false} onChange={() => togglePermission(role, permission.value)} /><span className="sr-only">Allow {roleDetails[role].label} to {permission.label.toLowerCase()}</span></label></td>;
                })}
              </tr>)}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Save changes</th>
                {roles.map((role) => {
                  const entry = matrix.find((item) => item.role === role);
                  return <td key={role}><button className="secondary compact" type="button" disabled={!entry || savingRole !== null} onClick={() => void saveRole(role)}><IconDeviceFloppy size={15} />{savingRole === role ? 'Saving…' : 'Save'}<span className="sr-only"> {roleDetails[role].label}</span></button><small role="status">{savedRole === role ? 'Saved' : ''}</small></td>;
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </>
  );
}
