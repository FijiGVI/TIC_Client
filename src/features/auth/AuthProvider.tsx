'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { actApi, api, logoutSession, restoreTokens, setTokens } from '@/lib/api';
import type { Role, TicPermission, User } from '@/lib/types';

type ActUser = { id: number; email: string; firstName?: string | null; lastName?: string | null; role: string; userRole?: { name?: string | null } | null; shouldChangePassword?: boolean };
type AuthSession = { accessToken: string; refreshToken?: string; user: ActUser };
type TicContext = { actor: { role: Role }; permissions: TicPermission[] };
type AuthContextValue = { user: User | null; loading: boolean; login(identifier: string, password: string): Promise<void>; register(input: { name: string; email: string; password: string }): Promise<void>; loginWithMicrosoft(idToken: string): Promise<void>; logout(): Promise<void>; refreshUser(): Promise<void> };

const defaultPermissions: Record<Role, TicPermission[]> = {
  admin: ['users.manage', 'roles.manage', 'forms.manage', 'requests.create', 'requests.read.all', 'requests.update', 'requests.approve'],
  request_manager: ['forms.manage', 'requests.create', 'requests.read.all', 'requests.update'],
  approver: ['requests.create', 'requests.read.assigned', 'requests.approve'],
  requester: ['requests.create', 'requests.read.own'],
};

function getTicRole(user: ActUser): Role {
  const actRole = user.role.toLowerCase();
  const accessRole = user.userRole?.name?.trim().toLowerCase() || '';
  if (actRole === 'admin' || accessRole === 'admin') return 'admin';
  if (['request manager', 'request_manager', 'hr manager'].includes(accessRole)) return 'request_manager';
  if (['approver', 'supervisor', 'department head'].includes(accessRole)) return 'approver';
  return 'requester';
}

function normalizeUser(user: ActUser, context?: TicContext): User {
  const role = context?.actor.role || getTicRole(user);
  return {
    id: String(user.id),
    email: user.email,
    name: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email,
    role,
    permissions: context?.permissions || defaultPermissions[role],
    mustChangePassword: Boolean(user.shouldChangePassword),
  };
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refreshUser = useCallback(async () => {
    const [actResponse, ticResponse] = await Promise.all([
      actApi.get<{ user: ActUser }>('/auth/me'),
      api.get<{ data: TicContext }>('/me'),
    ]);
    setUser(normalizeUser(actResponse.user, ticResponse.data));
  }, []);

  useEffect(() => {
    restoreTokens();
    const timer = window.setTimeout(() => {
      refreshUser().catch(() => setUser(null)).finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshUser]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    login: async (identifier, password) => {
      const session = await actApi.post<AuthSession>('/auth/login', { identifier, password });
      setTokens(session);
      const context = await api.get<{ data: TicContext }>('/me');
      setUser(normalizeUser(session.user, context.data));
    },
    register: async () => {
      throw new Error('Accounts are managed in ACT. Sign in with your existing ACT account.');
    },
    loginWithMicrosoft: async (idToken) => {
      const session = await actApi.post<AuthSession>('/auth/microsoft', { idToken });
      setTokens(session);
      const context = await api.get<{ data: TicContext }>('/me');
      setUser(normalizeUser(session.user, context.data));
    },
    logout: async () => {
      await logoutSession().catch(() => setTokens(null));
      setUser(null);
      router.replace('/login');
    },
    refreshUser,
  }), [loading, refreshUser, router, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
