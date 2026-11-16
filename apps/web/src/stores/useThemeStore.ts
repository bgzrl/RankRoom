import type { ThemeSummaryDto } from '@rankroom/shared';
import { create } from 'zustand';
import {
  ApiError,
  fetchAdminStatus,
  fetchThemes,
  verifyAdminPassword,
} from '../lib/api';
import {
  applyColorMode,
  clearAdminPassword,
  getInitialColorMode,
  getStoredAdminPassword,
  saveAdminPassword,
  type ColorMode,
} from '../lib/session';

interface ThemeStoreState {
  colorMode: ColorMode;
  themes: ThemeSummaryDto[];
  loading: boolean;
  error: string | null;
  adminRequired: boolean;
  adminUnlocked: boolean;
  adminModalOpen: boolean;
  setColorMode: (mode: ColorMode) => void;
  toggleColorMode: () => void;
  loadThemes: (filters?: { category?: string; q?: string }) => Promise<void>;
  refreshAdminStatus: () => Promise<boolean>;
  unlockAdmin: (password: string) => Promise<void>;
  openAdminModal: () => void;
  closeAdminModal: () => void;
  handlePotentialAdminError: (err: unknown) => boolean;
}

export const useThemeStore = create<ThemeStoreState>((set, get) => ({
  colorMode: getInitialColorMode(),
  themes: [],
  loading: false,
  error: null,
  adminRequired: false,
  adminUnlocked: Boolean(getStoredAdminPassword()),
  adminModalOpen: false,

  setColorMode: (mode) => {
    applyColorMode(mode);
    set({ colorMode: mode });
  },

  toggleColorMode: () => {
    const next: ColorMode = get().colorMode === 'dark' ? 'light' : 'dark';
    applyColorMode(next);
    set({ colorMode: next });
  },

  loadThemes: async (filters) => {
    set({ loading: true, error: null });
    try {
      const themes = await fetchThemes(filters);
      set({ themes, loading: false });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Impossible de charger les thèmes.',
      });
    }
  },

  refreshAdminStatus: async () => {
    try {
      const { adminRequired } = await fetchAdminStatus();
      const hasToken = Boolean(getStoredAdminPassword());
      set({
        adminRequired,
        adminUnlocked: !adminRequired || hasToken,
      });
      return adminRequired;
    } catch {
      return false;
    }
  },

  unlockAdmin: async (password) => {
    await verifyAdminPassword(password);
    saveAdminPassword(password);
    set({ adminUnlocked: true, adminModalOpen: false });
  },

  openAdminModal: () => set({ adminModalOpen: true }),
  closeAdminModal: () => set({ adminModalOpen: false }),

  handlePotentialAdminError: (err) => {
    if (err instanceof ApiError && err.status === 401) {
      clearAdminPassword();
      set({ adminRequired: true, adminUnlocked: false, adminModalOpen: true });
      return true;
    }
    return false;
  },
}));
