'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { actApi, api, hasStoredSession, logoutSession, restoreTokens, SESSION_EXPIRED_EVENT, setTokens } from '@/lib/api';
import type { Role, TicPermission, User } from '@/lib/types';

type ActUser = { id: number; email: string; firstName?: string | null; lastName?: string | null; role: string; userRole?: { name?: string | null } | null; shouldChangePassword?: boolean };
type AuthSession = { accessToken: string; refreshToken?: string; user: ActUser };
type MicrosoftRequesterSession = { accessToken: string; identity: { email: string; name: string; linkedUserId: number | null } };
type TicContext = { actor: { id: string; email: string; name: string; role: Role }; permissions: TicPermission[] };
type AuthContextValue = { user: User | null; loading: boolean; login(identifier: string, password: string): Promise<void>; register(input: { name: string; email: string; password: string }): Promise<void>; loginWithMicrosoft(idToken: string): Promise<void>; logout(): Promise<void>; refreshUser(): Promise<void> };

const defaultPermissions: Record<string, TicPermission[]> = {
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
    permissions: context?.permissions || defaultPermissions[role] || [],
    mustChangePassword: Boolean(user.shouldChangePassword),
  };
}

function normalizeTicActor(context: TicContext): User {
  return {
    id: context.actor.id,
    email: context.actor.email,
    name: context.actor.name || context.actor.email,
    role: context.actor.role,
    permissions: context.permissions,
    mustChangePassword: false,
  };
}

function isActAuthSession(session: AuthSession | MicrosoftRequesterSession): session is AuthSession {
  return 'user' in session;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refreshUser = useCallback(async () => {
    const ticResponse = await api.get<{ data: TicContext }>('/me');
    setUser(normalizeTicActor(ticResponse.data));
  }, []);

  useEffect(() => {
    restoreTokens();
    const timer = window.setTimeout(() => {
      if (!hasStoredSession()) {
        setLoading(false);
        return;
      }
      refreshUser().catch(() => setUser(null)).finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshUser]);

  useEffect(() => {
    const sessionExpired = () => {
      setUser(null);
      router.replace('/login');
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, sessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, sessionExpired);
  }, [router]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    login: async (identifier, password) => {
      try {
        const session = await api.post<{ accessToken: string }>('/auth/login', { identifier, password });
        setTokens(session);
        const context = await api.get<{ data: TicContext }>('/me');
        setUser(normalizeTicActor(context.data));
      } catch {
        const session = await actApi.post<AuthSession>('/auth/login', { identifier, password });
        setTokens(session);
        const context = await api.get<{ data: TicContext }>('/me');
        setUser(normalizeUser(session.user, context.data));
      }
    },
    register: async () => {
      throw new Error('Accounts are managed in ACT. Login with your existing ACT account.');
    },
    loginWithMicrosoft: async (idToken) => {
      const session = await actApi.post<AuthSession | MicrosoftRequesterSession>('/auth/microsoft', { idToken });
      setTokens(session);
      const context = await api.get<{ data: TicContext }>('/me');
      setUser(isActAuthSession(session) ? normalizeUser(session.user, context.data) : normalizeTicActor(context.data));
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
