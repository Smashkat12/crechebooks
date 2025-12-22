import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

type Theme = 'light' | 'dark' | 'system';
type DateFormat = 'dd/MM/yyyy' | 'yyyy-MM-dd' | 'MM/dd/yyyy';
type Currency = 'ZAR';

interface PreferencesState {
  // Display
  theme: Theme;
  dateFormat: DateFormat;
  currency: Currency;

  // Table preferences
  defaultPageSize: number;
  showCompactTables: boolean;

  // Dashboard
  dashboardPeriod: 'month' | 'quarter' | 'year';

  // Notifications
  emailNotifications: boolean;
  browserNotifications: boolean;

  // Actions
  setTheme: (theme: Theme) => void;
  setDateFormat: (format: DateFormat) => void;
  setDefaultPageSize: (size: number) => void;
  setShowCompactTables: (compact: boolean) => void;
  setDashboardPeriod: (period: 'month' | 'quarter' | 'year') => void;
  setEmailNotifications: (enabled: boolean) => void;
  setBrowserNotifications: (enabled: boolean) => void;
  resetPreferences: () => void;
}

const defaultPreferences = {
  theme: 'system' as Theme,
  dateFormat: 'dd/MM/yyyy' as DateFormat,
  currency: 'ZAR' as Currency,
  defaultPageSize: 20,
  showCompactTables: false,
  dashboardPeriod: 'month' as const,
  emailNotifications: true,
  browserNotifications: true,
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      ...defaultPreferences,

      setTheme: (theme) => set({ theme }),
      setDateFormat: (dateFormat) => set({ dateFormat }),
      setDefaultPageSize: (defaultPageSize) => set({ defaultPageSize }),
      setShowCompactTables: (showCompactTables) => set({ showCompactTables }),
      setDashboardPeriod: (dashboardPeriod) => set({ dashboardPeriod }),
      setEmailNotifications: (emailNotifications) => set({ emailNotifications }),
      setBrowserNotifications: (browserNotifications) => set({ browserNotifications }),
      resetPreferences: () => set(defaultPreferences),
    }),
    {
      name: 'crechebooks-preferences',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        theme: state.theme,
        dateFormat: state.dateFormat,
        defaultPageSize: state.defaultPageSize,
        showCompactTables: state.showCompactTables,
        dashboardPeriod: state.dashboardPeriod,
        emailNotifications: state.emailNotifications,
        browserNotifications: state.browserNotifications,
      }),
    }
  )
);
