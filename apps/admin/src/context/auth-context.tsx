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
const TOKEN_TIMESTAMP_KEY = 'kashyap_token_refreshed_at';
const AUTH_CHANNEL_NAME = 'kashyap_auth_channel';
const REFRESH_LOCK_NAME = 'kashyap_auth_refresh';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthSessionDto['user'] | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // In-flight refresh promise ref to coordinate concurrent refresh attempts within the same tab
  const refreshPromiseRef = useRef<Promise<string | null> | null>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  // Cross-tab broadcast channel listener for token rotation & session invalidation
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if ('BroadcastChannel' in window) {
      try {
        const channel = new BroadcastChannel(AUTH_CHANNEL_NAME);
        broadcastChannelRef.current = channel;
        channel.onmessage = (event) => {
          if (event.data?.type === 'TOKEN_REFRESHED' && event.data.accessToken) {
            setAccessToken(event.data.accessToken);
            if (event.data.user) setUser(event.data.user);
          } else if (event.data?.type === 'SESSION_EXPIRED') {
            setAccessToken(null);
            setUser(null);
          }
        };
      } catch {}
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === TOKEN_KEY) {
        setAccessToken(e.newValue);
      } else if (e.key === USER_KEY) {
        setUser(e.newValue ? JSON.parse(e.newValue) : null);
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('storage', handleStorage);
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.close();
        broadcastChannelRef.current = null;
      }
    };
  }, []);

  const refreshSession = useCallback(async (): Promise<string | null> => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const executeRefresh = async (): Promise<string | null> => {
      const performNetworkRefresh = async (): Promise<string | null> => {
        try {
          const session = await ApiClient.refreshToken();
          setAccessToken(session.accessToken);
          setUser(session.user);
          try {
            localStorage.setItem(TOKEN_KEY, session.accessToken);
            localStorage.setItem(USER_KEY, JSON.stringify(session.user));
            localStorage.setItem(TOKEN_TIMESTAMP_KEY, Date.now().toString());
          } catch {}

          if (broadcastChannelRef.current) {
            broadcastChannelRef.current.postMessage({
              type: 'TOKEN_REFRESHED',
              accessToken: session.accessToken,
              user: session.user,
            });
          }
          return session.accessToken;
        } catch {
          setAccessToken(null);
          setUser(null);
          try {
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(USER_KEY);
            localStorage.removeItem(TOKEN_TIMESTAMP_KEY);
          } catch {}
          if (broadcastChannelRef.current) {
            broadcastChannelRef.current.postMessage({ type: 'SESSION_EXPIRED' });
          }
          return null;
        }
      };

      if (typeof window !== 'undefined' && 'locks' in navigator && navigator.locks) {
        return await navigator.locks.request(REFRESH_LOCK_NAME, async () => {
          const storedToken = localStorage.getItem(TOKEN_KEY);
          const lastRefresh = Number(localStorage.getItem(TOKEN_TIMESTAMP_KEY) || '0');
          if (storedToken && Date.now() - lastRefresh < 4000) {
            setAccessToken(storedToken);
            const storedUser = localStorage.getItem(USER_KEY);
            if (storedUser) setUser(JSON.parse(storedUser));
            return storedToken;
          }
          return await performNetworkRefresh();
        });
      }

      return await performNetworkRefresh();
    };

    refreshPromiseRef.current = executeRefresh().finally(() => {
      refreshPromiseRef.current = null;
    });

    return refreshPromiseRef.current;
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

        const newAccessToken = await refreshSession();
        if (!newAccessToken && isMounted) {
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
      localStorage.setItem(USER_KEY, JSON.stringify(session.user));
      localStorage.setItem(TOKEN_TIMESTAMP_KEY, Date.now().toString());
    } catch {}

    if (broadcastChannelRef.current) {
      broadcastChannelRef.current.postMessage({
        type: 'TOKEN_REFRESHED',
        accessToken: session.accessToken,
        user: session.user,
      });
    }
  }, []);

  const logout = useCallback(async () => {
    const token = accessToken || undefined;
    await ApiClient.logout(undefined, token);

    setAccessToken(null);
    setUser(null);
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(TOKEN_TIMESTAMP_KEY);
    } catch {}

    if (broadcastChannelRef.current) {
      broadcastChannelRef.current.postMessage({ type: 'SESSION_EXPIRED' });
    }

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
