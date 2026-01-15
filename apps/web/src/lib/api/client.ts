/**
 * API Client
 * TASK-UI-001: Uses HttpOnly cookies for authentication (XSS protection)
 *
 * Authentication is handled via HttpOnly cookies automatically sent with requests.
 * No localStorage token storage - cookies are managed by the browser.
 */

import axios, { AxiosError, AxiosInstance } from 'axios';
import { signOut } from 'next-auth/react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// Track if we're currently handling a 401 to prevent multiple signouts
let isHandling401 = false;

/**
 * TASK-UI-001: API client configured with withCredentials for HttpOnly cookie auth
 * - Cookies are automatically sent with every request
 * - No need for manual Authorization header management
 */
export const apiClient: AxiosInstance = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
  withCredentials: true, // TASK-UI-001: Send HttpOnly cookies with requests
});

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401 && !isHandling401) {
      // Handle unauthorized - clear session and redirect
      if (typeof window !== 'undefined') {
        isHandling401 = true;

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
