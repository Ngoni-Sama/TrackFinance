import { create } from 'zustand';

export type ThemeMode = 'system' | 'light' | 'dark';

interface SettingsState {
  themeMode: ThemeMode;
  smsEnabled: boolean;
  lastSyncAt: number;
  hydrated: boolean;
  set: (patch: Partial<Omit<SettingsState, 'set'>>) => void;
}

/** UI-facing mirror of persisted settings (persisted in db localStorage, see data/settings.ts). */
export const useSettingsStore = create<SettingsState>((set) => ({
  themeMode: 'system',
  smsEnabled: false,
  lastSyncAt: 0,
  hydrated: false,
  set: (patch) => set(patch),
}));
