'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { actApi, api, hasStoredSession, logoutSession, restoreTokens, SESSION_EXPIRED_EVENT, setTokens } from '@/lib/api';
import type { Role, TicPermission, User } from '@/lib/types';
import { savePendingMicrosoftRegistration } from './pendingMicrosoftRegistration';

type ActUser = { id: number; email: string; firstName?: string | null; lastName?: string | null; role: string; userRole?: { name?: string | null } | null; shouldChangePassword?: boolean; authMethod?: 'password' | 'microsoft' };
type AuthSession = { accessToken: string; refreshToken?: string; user: ActUser };
type MicrosoftRequesterSession = { accessToken: string; identity: { email: string; name: string; linkedUserId: number | null } };
type MicrosoftRegistrationRequired = { registrationRequired: true; identity: { email: string; name: string } };
type TicContext = { actor: { id: string; email: string; name: string; role: Role }; permissions: TicPermission[]; roles?: Role[]; organizationType?: string | null; organizationName?: string | null; authMethod?: 'password' | 'microsoft' };
type AuthContextValue = { user: User | null; loading: boolean; login(identifier: string, password: string): Promise<void>; register(input: { name: string; email: string; password: string }): Promise<void>; loginWithMicrosoft(idToken: string): Promise<'authenticated' | 'registration_required'>; logout(): Promise<void>; refreshUser(): Promise<void>; switchRole(role: Role): Promise<void> };

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
    roles: context?.roles || [role],
    organizationType: context?.organizationType,
    organizationName: context?.organizationName,
    permissions: context?.permissions || defaultPermissions[role] || [],
    mustChangePassword: Boolean(user.shouldChangePassword),
    authMethod: context?.authMethod || user.authMethod || 'password',
  };
}

function normalizeTicActor(context: TicContext): User {
  return {
    id: context.actor.id,
    email: context.actor.email,
    name: context.actor.name || context.actor.email,
    role: context.actor.role,
    roles: context.roles || [context.actor.role],
    organizationType: context.organizationType,
    organizationName: context.organizationName,
    permissions: context.permissions,
    mustChangePassword: false,
    authMethod: context.authMethod || 'password',
  };
}

function isActAuthSession(session: AuthSession | MicrosoftRequesterSession): session is AuthSession {
  return 'user' in session;
}

function isMicrosoftRegistrationRequired(
  session: AuthSession | MicrosoftRequesterSession | MicrosoftRegistrationRequired,
): session is MicrosoftRegistrationRequired {
  return 'registrationRequired' in session && session.registrationRequired === true;
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
      const session = await actApi.post<AuthSession | MicrosoftRequesterSession | MicrosoftRegistrationRequired>('/auth/microsoft', { idToken });
      if (isMicrosoftRegistrationRequired(session)) {
        savePendingMicrosoftRegistration({ idToken, email: session.identity.email, name: session.identity.name });
        return 'registration_required';
      }
      setTokens(session);
      const context = await api.get<{ data: TicContext }>('/me');
      setUser(isActAuthSession(session) ? normalizeUser(session.user, context.data) : normalizeTicActor(context.data));
      return 'authenticated';
    },
    logout: async () => {
      await logoutSession().catch(() => setTokens(null));
      setUser(null);
      router.replace('/login');
    },
    switchRole: async (role) => {
      const response = await api.post<{ accessToken: string }>('/auth/switch-role', { role });
      setTokens(response);
      await refreshUser();
      router.replace('/dashboard');
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
