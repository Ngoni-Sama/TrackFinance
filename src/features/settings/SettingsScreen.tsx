import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { Alert, Pressable } from 'react-native';
import { Row, Screen, Segmented } from '../../components/Controls';
import { Pane, Separator } from '../../components/Pane';
import { Body, Caption } from '../../components/Typography';
import { ThemeMode, useSettingsStore } from '../../core/settingsStore';
import { exportCsv } from '../../data/repositories';
import { setThemeMode } from '../../data/settings';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { shareCsv } from '../../pdf/pdfGenerator';

function Link({ title, subtitle, onPress }: { title: string; subtitle?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress}>
      <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
        <Body>{title}</Body>
        <Body muted>›</Body>
      </Row>
      {subtitle ? <Caption upper={false}>{subtitle}</Caption> : null}
    </Pressable>
  );
}

export function SettingsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { themeMode, smsEnabled } = useSettingsStore();

  const onExport = async () => {
    try {
      await shareCsv(await exportCsv());
    } catch (e) {
      Alert.alert('Export failed', (e as Error).message);
    }
  };

  return (
    <Screen>
      <Pane title="Business">
        <Link title="Business profile" subtitle="Name, logo and payment details for invoices" onPress={() => nav.navigate('BusinessProfile')} />
        <Separator />
        <Link title="Customers" onPress={() => nav.navigate('Customers')} />
      </Pane>
      <Pane title="Tracking">
        <Link title="SMS tracking" subtitle={smsEnabled ? 'On — reading mobile money SMS on this phone' : 'Off — manual entries only'} onPress={() => nav.navigate('SmsSetup')} />
        <Separator />
        <Link title="Monthly budgets" onPress={() => nav.navigate('Budgets')} />
        <Separator />
        <Link title="Export to CSV" subtitle="Transactions and expenses, for Excel or Sheets" onPress={onExport} />
      </Pane>
      <Pane title="Appearance">
        <Segmented
          options={['system', 'light', 'dark'] as const}
          value={themeMode}
          onChange={(m: ThemeMode) => setThemeMode(m)}
          labels={{ system: 'System', light: 'Light', dark: 'Dark' }}
        />
      </Pane>
      <Pane title="Privacy">
        <Body muted>
          Everything stays on this phone. SMS are read and parsed on-device; no SMS content, transaction or invoice is uploaded anywhere.
        </Body>
      </Pane>
    </Screen>
  );
}
