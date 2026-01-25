/**
 * API Client
 * TASK-UI-001: Uses HttpOnly cookies for authentication (XSS protection)
 *
 * Authentication is handled via:
 * - Authorization header with JWT token from NextAuth session
 * - HttpOnly cookies as fallback (when available)
 */

import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { signOut, getSession } from 'next-auth/react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Track if we're currently handling a 401 to prevent multiple signouts
let isHandling401 = false;

// Store token in memory (not localStorage for XSS protection)
let authToken: string | null = null;

/**
 * Set the auth token for API requests
 */
export function setAuthToken(token: string | null) {
  authToken = token;
}

/**
 * Get the current auth token
 */
export function getAuthToken(): string | null {
  return authToken;
}

/**
 * TASK-UI-001: API client configured with Authorization header support
 * - Uses in-memory token from NextAuth session
 * - Sends credentials for cookie fallback
 */
export const apiClient: AxiosInstance = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
  withCredentials: true, // Send cookies as fallback
});

// Request interceptor to add Authorization header
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // Try to get token from memory first
    let token = authToken;

    // If no token in memory, try to get from NextAuth session
    if (!token && typeof window !== 'undefined') {
      try {
        const session = await getSession();
        if (session?.accessToken) {
          token = session.accessToken as string;
          authToken = token; // Cache it
        }
      } catch {
        // Ignore session fetch errors
      }
    }

    // Add Authorization header if we have a token
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    // Only handle 401 once, and only in browser
    if (error.response?.status === 401 && !isHandling401 && typeof window !== 'undefined') {
      isHandling401 = true;

      try {
        // Clear cached token
        authToken = null;

        // Try to refresh the session first
        const session = await getSession();

        if (session?.accessToken) {
          // Session is still valid, update cached token and retry might work
          authToken = session.accessToken as string;
          isHandling401 = false;
          // Don't redirect - let the caller handle the error
          return Promise.reject(error);
        }

        // No valid session - sign out and redirect to login
        // Use a small delay to prevent race conditions with other requests
        setTimeout(async () => {
          try {
            await signOut({ redirect: false });
          } catch {
            // Ignore signOut errors
          }
          // Force redirect to login
          window.location.href = '/login';
        }, 100);
      } catch {
        // If session check fails, redirect to login
        setTimeout(() => {
          window.location.href = '/login';
        }, 100);
      }
    }
    return Promise.reject(error);
  }
);

/**
 * Reset the 401 handling flag and clear cached token (call after successful login or logout)
 */
export function resetAuthState() {
  isHandling401 = false;
}

/**
 * Clear auth state (call on logout)
 */
export function clearAuthState() {
  isHandling401 = false;
  authToken = null;
}
