import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, TOKEN_KEY, extractError } from './api';

export type User = {
  id: string;
  email: string;
  full_name?: string;
  mobile?: string;
  picture?: string;
  auth_provider?: string;
  created_at?: string;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  signedIn: boolean;
  register: (email: string, password: string, fullName?: string, mobile?: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthCtx = createContext<AuthState | undefined>(undefined);

WebBrowser.maybeCompleteAuthSession();

const buildRedirectUrl = (): string => {
  // Auth screen route — Emergent appends `#session_id=…` to this URL.
  if (Platform.OS === 'web') {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/auth`;
  }
  return Linking.createURL('/auth');
};

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

  // --- Helper: exchange Emergent session_id ----------------------------
  const exchangeSessionId = useCallback(async (sessionId: string) => {
    const r = await api.post('/auth/google/session', null, {
      headers: { 'X-Session-ID': sessionId },
    });
    await AsyncStorage.setItem(TOKEN_KEY, r.data.access_token);
    setUser(r.data.user);
  }, []);

  // --- Cold-start + hot deep-link handler for mobile ------------------
  useEffect(() => {
    let mounted = true;

    const parseSessionFromUrl = (url: string | null): string | null => {
      if (!url) return null;
      const hashIdx = url.indexOf('#');
      const queryIdx = url.indexOf('?');
      const tail = hashIdx >= 0 ? url.slice(hashIdx + 1) : queryIdx >= 0 ? url.slice(queryIdx + 1) : '';
      if (!tail) return null;
      const params = new URLSearchParams(tail);
      return params.get('session_id');
    };

    const tryProcess = async (url: string | null) => {
      const sid = parseSessionFromUrl(url);
      if (sid && mounted) {
        try {
          await exchangeSessionId(sid);
        } catch {
          /* ignore */
        }
      }
    };

    (async () => {
      // Cold start
      const initial = await Linking.getInitialURL();
      await tryProcess(initial);

      // Web hash detection
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location.hash) {
        await tryProcess(window.location.href);
        // Clean the hash after processing
        window.history.replaceState(null, '', window.location.pathname);
      }

      await refresh();
      if (mounted) setLoading(false);
    })();

    const sub = Linking.addEventListener('url', ({ url }) => tryProcess(url));
    return () => {
      mounted = false;
      sub.remove();
    };
  }, [refresh, exchangeSessionId]);

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

  const loginWithGoogle = async () => {
    const redirectUrl = buildRedirectUrl();
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') window.location.href = authUrl;
      return;
    }

    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
    if (result.type === 'success' && result.url) {
      const fragmentStart = result.url.indexOf('#');
      const queryStart = result.url.indexOf('?');
      const tail = fragmentStart >= 0 ? result.url.slice(fragmentStart + 1)
                 : queryStart >= 0 ? result.url.slice(queryStart + 1) : '';
      const sid = new URLSearchParams(tail).get('session_id');
      if (sid) await exchangeSessionId(sid);
      else throw new Error('No session_id returned from Google');
    } else if (result.type === 'cancel') {
      throw new Error('Sign-in cancelled');
    }
  };

  const logout = async () => {
    try { await api.post('/auth/logout'); } catch { /* ignore */ }
    await AsyncStorage.removeItem(TOKEN_KEY);
    setUser(null);
  };

  return (
    <AuthCtx.Provider value={{ user, loading, signedIn: !!user, register, login, loginWithGoogle, logout, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
};

export const useAuth = (): AuthState => {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};

// Re-export so importers can reuse the error helper.
export { extractError };
