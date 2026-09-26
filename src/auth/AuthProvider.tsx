import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError, setUnauthenticatedHandler, type Envelope } from '@/lib/api';
import { configureFormatting } from '@/lib/format';
import type { AuthUser, Role } from '@/lib/types';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  setUser: (u: AuthUser | null) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  can: (ability: string) => boolean;
  is: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function homePath(user: AuthUser | null): string {
  if (!user) return '/login';
  switch (user.role) {
    case 'super_admin':
      return '/admin';
    case 'technician':
      return '/tech';
    case 'customer':
      return `/portal/${user.tenant?.slug ?? ''}`;
    default:
      return '/dashboard';
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  const setUser = useCallback((u: AuthUser | null) => {
    setUserState(u);
    configureFormatting({ currency: u?.tenant?.currency, timezone: u?.tenant?.timezone });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get<Envelope<{ user: AuthUser }>>('/auth/me');
      setUser(res.data.user);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) setUser(null);
      else throw e;
    }
  }, [setUser]);

  useEffect(() => {
    refresh()
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [refresh, setUser]);

  useEffect(() => {
    setUnauthenticatedHandler(() => {
      setUser(null);
      queryClient.clear();
    });
  }, [queryClient, setUser]);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      const slug = user?.role === 'customer' ? user.tenant?.slug : null;
      setUser(null);
      queryClient.clear();
      window.location.assign(slug ? `/portal/${slug}/login` : '/login');
    }
  }, [queryClient, setUser, user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      setUser,
      refresh,
      logout,
      can: (ability) => Boolean(user?.abilities.includes(ability)),
      is: (...roles) => Boolean(user && roles.includes(user.role)),
    }),
    [user, loading, setUser, refresh, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
