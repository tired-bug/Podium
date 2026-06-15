import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import api from '../lib/api';

interface User {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'developer' | 'viewer';
  last_login?: string;
  created_at?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
  isAdmin: boolean;
  isDeveloper: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('podium_token'));
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    localStorage.removeItem('podium_token');
    setToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const storedToken = localStorage.getItem('podium_token');
    if (!storedToken) { setLoading(false); return; }
    try {
      const { data } = await api.get('/api/auth/me');
      setUser(data);
    } catch {
      logout();
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = useCallback((newToken: string, newUser: User) => {
    localStorage.setItem('podium_token', newToken);
    setToken(newToken);
    setUser(newUser);
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      token,
      loading,
      login,
      logout,
      refreshUser,
      isAdmin: user?.role === 'admin',
      isDeveloper: user?.role === 'admin' || user?.role === 'developer',
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
