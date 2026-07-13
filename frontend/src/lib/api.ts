import axios from 'axios';

const BASE_URL = (import.meta.env.VITE_API_URL as string) || '';
export { BASE_URL as API_BASE_URL };

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
    // Only redirect on 401 for non-auth endpoints to avoid redirect loops
    if (error.response?.status === 401) {
      const url: string = error.config?.url || '';
      const isAuthEndpoint = url.includes('/api/auth/login') || url.includes('/api/auth/signup') || url.includes('/api/auth/me');
      if (!isAuthEndpoint) {
        localStorage.removeItem('podium_token');
        // Use SPA navigation via custom event — avoids full page reload
        window.dispatchEvent(new CustomEvent('podium:unauthorized'));
      }
    }
    return Promise.reject(error);
  }
);

export default api;
