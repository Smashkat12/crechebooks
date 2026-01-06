import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { signOut } from 'next-auth/react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// Track if we're currently handling a 401 to prevent multiple signouts
let isHandling401 = false;

export const apiClient: AxiosInstance = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Request interceptor for auth token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Token will be added by auth layer - just return config
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token');
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401 && !isHandling401) {
      // Handle unauthorized - clear everything and redirect
      if (typeof window !== 'undefined') {
        isHandling401 = true;
        localStorage.removeItem('token');

        // Clear next-auth session properly
        try {
          await signOut({ redirect: false });
        } catch {
          // Ignore signOut errors
        }

        // Force redirect to login
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

/**
 * Reset the 401 handling flag (call after successful login)
 */
export function resetAuthState() {
  isHandling401 = false;
}
