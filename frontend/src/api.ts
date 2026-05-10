import axios, { AxiosError, AxiosInstance } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export const TOKEN_KEY = 'tn_auth_token';

export const api: AxiosInstance = axios.create({
  baseURL: `${BASE}/api`,
  timeout: 30000,
});

api.interceptors.request.use(async (cfg) => {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (token) {
    cfg.headers = cfg.headers ?? {};
    (cfg.headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  (err: AxiosError) => {
    return Promise.reject(err);
  }
);

export const extractError = (err: unknown, fallback = 'Something went wrong'): string => {
  const e = err as AxiosError<{ detail?: string | { msg?: string }[] }>;
  const detail = e?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg as string;
  return e?.message || fallback;
};
