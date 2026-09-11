'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { AuthSessionDto, Role } from '@kashyap/contracts';
import { ApiClient } from '../lib/api-client';

interface AuthContextType {
  user: AuthSessionDto['user'] | null;
  accessToken: string | null;
  isLoading: boolean;
  login: (session: AuthSessionDto) => void;
  logout: () => Promise<void>;
  refreshSession: () => Promise<string | null>;
  hasRole: (role: Role) => boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = 'kashyap_admin_access_token';
const USER_KEY = 'kashyap_admin_user';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthSessionDto['user'] | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // In-flight refresh promise ref to coordinate concurrent refresh attempts
  const refreshPromiseRef = useRef<Promise<AuthSessionDto> | null>(null);

  const refreshSession = useCallback(async (): Promise<string | null> => {
    // If a refresh is already ongoing, coordinate and wait for that exact promise
    if (refreshPromiseRef.current) {
      try {
        const session = await refreshPromiseRef.current;
        return session.accessToken;
      } catch {
        return null;
      }
    }

    try {
      refreshPromiseRef.current = ApiClient.refreshToken();
      const session = await refreshPromiseRef.current;
      setAccessToken(session.accessToken);
      setUser(session.user);
      try {
        localStorage.setItem(TOKEN_KEY, session.accessToken);
        localStorage.setItem(USER_KEY, JSON.stringify(session.user));
      } catch {}
      return session.accessToken;
    } catch {
      // Session invalid or expired: clear local credentials
      setAccessToken(null);
      setUser(null);
      try {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      } catch {}
      return null;
    } finally {
      refreshPromiseRef.current = null;
    }
  }, []);

  // Initialize session: restore from server via HttpOnly cookie
  useEffect(() => {
    let isMounted = true;

    async function initSession() {
      try {
        const storedToken = localStorage.getItem(TOKEN_KEY);
        const storedUser = localStorage.getItem(USER_KEY);
        if (storedToken && storedUser) {
          setAccessToken(storedToken);
          setUser(JSON.parse(storedUser));
        }

        // Validate or restore server session with fresh credentials
        const newAccessToken = await refreshSession();
        if (!newAccessToken && isMounted) {
          // If refresh failed and no valid session, reset
          setAccessToken(null);
          setUser(null);
        }
      } catch {
        // Storage or network error
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    initSession();

    return () => {
      isMounted = false;
    };
  }, [refreshSession]);

  const login = useCallback((session: AuthSessionDto) => {
    setAccessToken(session.accessToken);
    setUser(session.user);
    try {
      localStorage.setItem(TOKEN_KEY, session.accessToken);
      // NOTE: Refresh token is NEVER stored in localStorage (handled via HttpOnly cookies)
      localStorage.setItem(USER_KEY, JSON.stringify(session.user));
    } catch {}
  }, []);

  const logout = useCallback(async () => {
    const token = accessToken || undefined;
    await ApiClient.logout(undefined, token);

    setAccessToken(null);
    setUser(null);
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {}

    window.location.href = '/login';
  }, [accessToken]);

  const hasRole = useCallback(
    (role: Role): boolean => {
      if (!user || !user.roles) return false;
      return user.roles.includes(role);
    },
    [user],
  );

  const isAdmin = Boolean(
    user && (user.roles.includes(Role.SUPER_ADMIN) || user.roles.includes(Role.BRANCH_ADMIN)),
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isLoading,
        login,
        logout,
        refreshSession,
        hasRole,
        isAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
