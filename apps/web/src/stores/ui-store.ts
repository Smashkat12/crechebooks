import { create } from 'zustand';

interface UIState {
  // Sidebar
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;

  // Mobile nav
  mobileNavOpen: boolean;

  // Modals/Dialogs
  activeModal: string | null;
  modalData: Record<string, unknown> | null;

  // Loading states
  globalLoading: boolean;

  // Actions
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setMobileNavOpen: (open: boolean) => void;
  openModal: (modalId: string, data?: Record<string, unknown>) => void;
  closeModal: () => void;
  setGlobalLoading: (loading: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  sidebarCollapsed: false,
  mobileNavOpen: false,
  activeModal: null,
  modalData: null,
  globalLoading: false,

  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
  openModal: (modalId, data) => set({ activeModal: modalId, modalData: data ?? null }),
  closeModal: () => set({ activeModal: null, modalData: null }),
  setGlobalLoading: (loading) => set({ globalLoading: loading }),
}));
