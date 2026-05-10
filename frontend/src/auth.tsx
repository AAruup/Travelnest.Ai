import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, TOKEN_KEY } from './api';

export type User = {
  id: string;
  email: string;
  full_name?: string;
  mobile?: string;
  created_at?: string;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  signedIn: boolean;
  register: (email: string, password: string, fullName?: string, mobile?: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthCtx = createContext<AuthState | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      if (!token) {
        setUser(null);
        return;
      }
      const r = await api.get('/auth/me');
      setUser(r.data);
    } catch {
      await AsyncStorage.removeItem(TOKEN_KEY);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const register = async (email: string, password: string, fullName?: string, mobile?: string) => {
    const r = await api.post('/auth/register', {
      email,
      password,
      full_name: fullName ?? '',
      mobile: mobile ?? '',
    });
    await AsyncStorage.setItem(TOKEN_KEY, r.data.access_token);
    setUser(r.data.user);
  };

  const login = async (email: string, password: string) => {
    const r = await api.post('/auth/login', { email, password });
    await AsyncStorage.setItem(TOKEN_KEY, r.data.access_token);
    setUser(r.data.user);
  };

  const logout = async () => {
    await AsyncStorage.removeItem(TOKEN_KEY);
    setUser(null);
  };

  return (
    <AuthCtx.Provider value={{ user, loading, signedIn: !!user, register, login, logout, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
};

export const useAuth = (): AuthState => {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
