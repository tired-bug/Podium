/// <reference types="vite/client" />
import axios from 'axios';

// In production (Cloudflare Pages), VITE_API_URL is set to the Render backend URL.
// In dev, it's empty so the Vite proxy handles /api → localhost:4000.
const BASE_URL = (import.meta.env.VITE_API_URL as string) || '';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('podium_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 responses globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('podium_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
