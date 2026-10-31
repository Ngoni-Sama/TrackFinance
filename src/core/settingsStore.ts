import { create } from 'zustand';

export type ThemeMode = 'system' | 'light' | 'dark';

interface SettingsState {
  themeMode: ThemeMode;
  smsEnabled: boolean;
  /** Show website icons for known merchants (requests the merchant's domain only). */
  merchantLogos: boolean;
  /** User accepted sending financial data to the AI assistant. */
  aiEnabled: boolean;
  lastSyncAt: number;
  hydrated: boolean;
  set: (patch: Partial<Omit<SettingsState, 'set'>>) => void;
}

/** UI-facing mirror of persisted settings (persisted in db localStorage, see data/settings.ts). */
export const useSettingsStore = create<SettingsState>((set) => ({
  themeMode: 'system',
  smsEnabled: false,
  merchantLogos: true,
  aiEnabled: false,
  lastSyncAt: 0,
  hydrated: false,
  set: (patch) => set(patch),
}));
