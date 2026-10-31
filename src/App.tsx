import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { ActivityIndicator, Platform, useColorScheme, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useSettingsStore } from './core/settingsStore';
import { useTheme } from './core/theme';
import { isEmpty, seedDemoData } from './data/demoData';
import { hydrateSettings } from './data/settings';
import { RootNavigator } from './navigation/RootNavigator';
import { startBackgroundSync } from './sms/backgroundSync';
import { hasSmsPermission } from './sms/permissions';
import { startSmsListener } from './sms/smsListener';
import { syncSmsInbox } from './sms/smsProcessor';

export default function App() {
  const t = useTheme();
  const system = useColorScheme();
  const { hydrated, smsEnabled, themeMode } = useSettingsStore();
  const dark = themeMode === 'dark' || (themeMode === 'system' && system === 'dark');

  useEffect(() => {
    (async () => {
      // The web build is a demo: start it with sample data.
      if (Platform.OS === 'web' && (await isEmpty())) await seedDemoData();
      await hydrateSettings();
    })().catch((e) => {
      console.warn('[TrackFinance] settings load failed', e);
      useSettingsStore.getState().set({ hydrated: true });
    });
  }, []);

  // SMS tracking is opt-in (manual-only mode otherwise): listen live, catch up on start, sync in background.
  useEffect(() => {
    if (!hydrated || !smsEnabled) return;
    let stop: (() => void) | undefined;
    (async () => {
      if (!(await hasSmsPermission())) return;
      stop = startSmsListener();
      syncSmsInbox().catch((e) => console.warn('[TrackFinance] startup sync failed', e));
      startBackgroundSync().catch((e) => console.warn('[TrackFinance] background sync setup failed', e));
    })();
    return () => stop?.();
  }, [hydrated, smsEnabled]);

  if (!hydrated) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.background }}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <RootNavigator dark={dark} />
    </SafeAreaProvider>
  );
}
