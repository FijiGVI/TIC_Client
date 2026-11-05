"use client";

import {
  IconEye,
  IconEyeOff,
  IconPencil,
  IconRefresh,
  IconUserPlus,
  IconX,
} from "@tabler/icons-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Pagination } from "@/components/Pagination";
import { api } from "@/lib/api";
import { sendEmail } from "@/lib/email";
import type {
  ManagedUser,
  PaginationMeta,
  Role,
  RolePermissionSet,
  TicPermission,
} from "@/lib/types";

const roles: Role[] = ["admin", "request_manager", "approver", "requester"];
const permissions: TicPermission[] = [
  "users.manage",
  "roles.manage",
  "forms.manage",
  "requests.create",
  "requests.read.all",
  "requests.read.assigned",
  "requests.read.own",
  "requests.update",
  "requests.approve",
];
const initialUser = {
  name: "",
  email: "",
  password: "",
  role: "requester" as Role,
};
const initialMeta: PaginationMeta = { page: 1, pageSize: 20, total: 0, totalPages: 1 };

export default function UsersPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [matrix, setMatrix] = useState<RolePermissionSet[]>([]);
  const [draft, setDraft] = useState(initialUser);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [editDraft, setEditDraft] = useState<Pick<ManagedUser, "name" | "email" | "role"> | null>(null);
  const [updatingId, setUpdatingId] = useState<string | number | null>(null);
  const [source, setSource] = useState<"tic" | "act">("tic");
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<PaginationMeta>(initialMeta);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [userResponse, roleResponse] = await Promise.all([
        api.get<{ data: ManagedUser[]; meta: PaginationMeta }>(`/${source === "tic" ? "users" : "act-identities"}?page=${page}&pageSize=20`),
        api.get<{ data: RolePermissionSet[] }>("/roles/permissions"),
      ]);
      setUsers(userResponse.data);
      setMeta(userResponse.meta);
      setMatrix(roleResponse.data);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to load users and roles",
      );
    } finally {
      setLoading(false);
    }
  }, [page, source]);

  useEffect(() => {
    // Loading is intentionally initiated when the requested server page changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const createUser = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.post("/users", draft);
      let emailWarning = "";
      try {
        await sendEmail({
          to: draft.email,
          subject: "Your TIC account is ready",
          message: `Your TIC account has been created. Sign in with ${draft.email} using this temporary password: ${draft.password}. You will be asked to change it after signing in.`,
        });
      } catch (reason) {
        emailWarning = reason instanceof Error ? ` User created, but ${reason.message.toLowerCase()}.` : " User created, but the welcome email could not be sent.";
      }
      setDraft(initialUser);
      await load();
      if (emailWarning) setError(emailWarning.trim());
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to create user",
      );
    } finally {
      setSaving(false);
    }
  };

  const beginEdit = (user: ManagedUser) => {
    setEditingId(user.id);
    setEditDraft({ name: user.name, email: user.email, role: user.role });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(null);
  };

  const updateUser = async (user: ManagedUser) => {
    if (!editDraft) return;
    setError("");
    setUpdatingId(user.id);
    try {
      await api.patch(`/users/${user.id}`, editDraft);
      cancelEdit();
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to update user",
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const setActive = async (user: ManagedUser, active: boolean) => {
    setError("");
    setUpdatingId(user.id);
    try {
      await api.patch(`/users/${user.id}/active`, { active });
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to update account status",
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const togglePermission = (role: Role, permission: TicPermission) => {
    setMatrix((current) =>
      current.map((entry) =>
        entry.role !== role
          ? entry
          : {
              ...entry,
              permissions: entry.permissions.includes(permission)
                ? entry.permissions.filter((item) => item !== permission)
                : [...entry.permissions, permission],
            },
      ),
    );
  };

  const saveRole = async (entry: RolePermissionSet) => {
    setError("");
    try {
      await api.put(`/roles/${entry.role}/permissions`, {
        permissions: entry.permissions,
      });
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to save role permissions",
      );
    }
  };

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>Users & roles</h1>
          <p>Create accounts, control access, and review account activity.</p>
        </div>
        <button
          className="secondary"
          onClick={() => void load()}
          disabled={loading}
        >
          <IconRefresh size={17} />
          Refresh
        </button>
      </header>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      <div className="users-layout">
        <section className="surface">
          <div className="surface-toolbar">
            <div>
              <h2>{source === "tic" ? "TIC accounts" : "ACT identities"}</h2>
              <small>{meta.total} accounts</small>
            </div>
            <div className="segmented"><button className={source === "tic" ? "selected" : ""} onClick={() => { setSource("tic"); setPage(1); }}>TIC accounts</button><button className={source === "act" ? "selected" : ""} onClick={() => { setSource("act"); setPage(1); }}>ACT identities</button></div>
          </div>
          <div className="user-list">
            {users.map((user) => (
              <div className="user-row" key={user.id}>
                <span className="avatar">{user.name.slice(0, 1)}</span>
                <div className="user-identity">
                  {editingId === user.id && editDraft ? (
                    <div className="user-edit-fields">
                      <input aria-label={`Name for ${user.name}`} value={editDraft.name} onChange={(event) => setEditDraft({ ...editDraft, name: event.target.value })} />
                      <input aria-label={`Email for ${user.name}`} type="email" value={editDraft.email} onChange={(event) => setEditDraft({ ...editDraft, email: event.target.value })} />
                    </div>
                  ) : (
                    <><strong>{user.name}</strong><small>{user.email}</small></>
                  )}
                  <small>
                    Created {new Date(user.createdAt).toLocaleString()} ·
                    Updated {new Date(user.updatedAt).toLocaleString()}
                  </small>
                </div>
                <span
                  className={`status ${user.active ? "completed" : "rejected"}`}
                >
                  {user.active ? "Active" : "Inactive"}
                </span>
                <select
                  aria-label={`Role for ${user.name}`}
                  disabled={source === "act" || editingId !== user.id || updatingId === user.id}
                  value={editingId === user.id && editDraft ? editDraft.role : user.role}
                  onChange={(event) => editDraft && setEditDraft({ ...editDraft, role: event.target.value as Role })}
                >
                  {roles.map((role) => (
                    <option value={role} key={role}>
                      {role.replace("_", " ")}
                    </option>
                  ))}
                </select>
                {source === "tic" && <div className="user-actions">
                  {editingId === user.id ? (
                    <>
                      <button className="primary compact" disabled={updatingId === user.id || !editDraft?.name.trim() || !editDraft?.email.trim()} onClick={() => void updateUser(user)}>Save</button>
                      <button className="secondary compact" disabled={updatingId === user.id} onClick={cancelEdit} aria-label={`Cancel editing ${user.name}`}><IconX size={16} /></button>
                    </>
                  ) : (
                    <button className="secondary compact" disabled={updatingId !== null} onClick={() => beginEdit(user)}><IconPencil size={16} />Edit</button>
                  )}
                  <button className={user.active ? "danger compact" : "secondary compact"} disabled={updatingId === user.id || editingId === user.id} onClick={() => void setActive(user, !user.active)}>{user.active ? "Deactivate" : "Restore"}</button>
                </div>}
              </div>
            ))}
          </div>
          <Pagination meta={meta} disabled={loading} onPageChange={setPage} />
        </section>
        <aside className="surface invite-card">
          <div className="editor-heading">
            <span>
              <IconUserPlus size={20} />
            </span>
            <div>
              <h2>Create user</h2>
              <p>
                The user must change this temporary password after signing in.
              </p>
            </div>
          </div>
          <form onSubmit={createUser}>
            <label>
              Full name
              <input
                required
                maxLength={200}
                value={draft.name}
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
              />
            </label>
            <label>
              Email
              <input
                required
                type="email"
                value={draft.email}
                onChange={(event) =>
                  setDraft({ ...draft, email: event.target.value })
                }
              />
            </label>
            <label>
              Temporary password
              <span className="password-input">
                <input
                  required
                  minLength={12}
                  type={showPassword ? "text" : "password"}
                  value={draft.password}
                  onChange={(event) =>
                    setDraft({ ...draft, password: event.target.value })
                  }
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? (
                    <IconEyeOff size={18} />
                  ) : (
                    <IconEye size={18} />
                  )}
                </button>
              </span>
              <small>
                12+ characters with uppercase, lowercase, and a number.
              </small>
            </label>
            <label>
              TIC role
              <select
                value={draft.role}
                onChange={(event) =>
                  setDraft({ ...draft, role: event.target.value as Role })
                }
              >
                {roles.map((role) => (
                  <option value={role} key={role}>
                    {role.replace("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary full-width" disabled={saving}>
              {saving ? "Creating…" : "Create user"}
            </button>
          </form>
        </aside>
      </div>
      <section className="surface permission-section">
        <div className="surface-toolbar">
          <div>
            <h2>Permission matrix</h2>
            <small>Server-authoritative TIC permissions</small>
          </div>
        </div>
        <div className="permission-table">
          <div className="permission-row heading">
            <span>Permission</span>
            {roles.map((role) => (
              <strong key={role}>{role.replace("_", " ")}</strong>
            ))}
          </div>
          {permissions.map((permission) => (
            <div className="permission-row" key={permission}>
              <span>{permission}</span>
              {roles.map((role) => {
                const entry = matrix.find((item) => item.role === role);
                return (
                  <label key={role}>
                    <input
                      type="checkbox"
                      checked={entry?.permissions.includes(permission) || false}
                      onChange={() => togglePermission(role, permission)}
                    />
                    <span className="sr-only">
                      {role} {permission}
                    </span>
                  </label>
                );
              })}
            </div>
          ))}
          <div className="permission-actions">
            {roles.map((role) => {
              const entry = matrix.find((item) => item.role === role);
              return (
                <button
                  className="secondary"
                  key={role}
                  disabled={!entry}
                  onClick={() => entry && void saveRole(entry)}
                >
                  Save {role.replace("_", " ")}
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}
