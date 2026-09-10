'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { AuthSessionDto, Role } from '@kashyap/contracts';
import { ApiClient } from '../lib/api-client';

interface AuthContextType {
  user: AuthSessionDto['user'] | null;
  accessToken: string | null;
  isLoading: boolean;
  login: (session: AuthSessionDto) => void;
  logout: () => Promise<void>;
  hasRole: (role: Role) => boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = 'kashyap_admin_access_token';
const REFRESH_KEY = 'kashyap_admin_refresh_token';
const USER_KEY = 'kashyap_admin_user';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthSessionDto['user'] | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize from storage
  useEffect(() => {
    try {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      const storedUser = localStorage.getItem(USER_KEY);
      if (storedToken && storedUser) {
        setAccessToken(storedToken);
        setUser(JSON.parse(storedUser));
      }
    } catch {
      // Storage unavailable or corrupted
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback((session: AuthSessionDto) => {
    setAccessToken(session.accessToken);
    setUser(session.user);
    try {
      localStorage.setItem(TOKEN_KEY, session.accessToken);
      localStorage.setItem(REFRESH_KEY, session.refreshToken);
      localStorage.setItem(USER_KEY, JSON.stringify(session.user));
    } catch {}
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem(REFRESH_KEY) || undefined;
    const token = accessToken || undefined;
    await ApiClient.logout({ refreshToken }, token);

    setAccessToken(null);
    setUser(null);
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_KEY);
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
