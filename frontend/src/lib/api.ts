/// <reference types="vite/client" />
import axios from 'axios';

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

// Handle 401 responses
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
