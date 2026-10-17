import { ThemeMode, useSettingsStore } from '../core/settingsStore';
import { database } from './db';

/** Persisted settings live in WatermelonDB's key-value localStorage. */
const KEYS = {
  themeMode: 'theme_mode',
  smsEnabled: 'sms_enabled',
  lastSyncAt: 'last_sync_at',
} as const;

export async function hydrateSettings() {
  const ls = database.localStorage;
  const [themeMode, smsEnabled, lastSyncAt] = await Promise.all([
    ls.get<string>(KEYS.themeMode),
    ls.get<string>(KEYS.smsEnabled),
    ls.get<string>(KEYS.lastSyncAt),
  ]);
  useSettingsStore.getState().set({
    themeMode: (themeMode as ThemeMode) ?? 'system',
    smsEnabled: smsEnabled === '1',
    lastSyncAt: Number(lastSyncAt ?? 0) || 0,
    hydrated: true,
  });
}

export async function setThemeMode(mode: ThemeMode) {
  await database.localStorage.set(KEYS.themeMode, mode);
  useSettingsStore.getState().set({ themeMode: mode });
}

export async function setSmsEnabled(enabled: boolean) {
  await database.localStorage.set(KEYS.smsEnabled, enabled ? '1' : '0');
  useSettingsStore.getState().set({ smsEnabled: enabled });
}

export async function getSmsEnabled(): Promise<boolean> {
  return (await database.localStorage.get<string>(KEYS.smsEnabled)) === '1';
}

export async function getLastSyncAt(): Promise<number> {
  return Number((await database.localStorage.get<string>(KEYS.lastSyncAt)) ?? 0) || 0;
}

export async function setLastSyncAt(ms: number) {
  await database.localStorage.set(KEYS.lastSyncAt, String(ms));
  useSettingsStore.getState().set({ lastSyncAt: ms });
}
