import axios from 'axios';

const BASE_URL = (import.meta.env.VITE_API_URL as string) || '';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('podium_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Skip redirect for the auth-check endpoint itself — AuthContext handles that state
      const url = error.config?.url || '';
      if (!url.includes('/api/auth/me')) {
        localStorage.removeItem('podium_token');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
