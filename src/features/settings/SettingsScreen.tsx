import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { Alert, Pressable } from 'react-native';
import { Row, Screen, Segmented } from '../../components/Controls';
import { Pane, Separator } from '../../components/Pane';
import { Body, Caption } from '../../components/Typography';
import { ThemeMode, useSettingsStore } from '../../core/settingsStore';
import { clearAllData, isEmpty, seedDemoData } from '../../data/demoData';
import { exportCsv } from '../../data/repositories';
import { hydrateSettings, setAiEnabled, setMerchantLogos, setThemeMode } from '../../data/settings';
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
  const { themeMode, smsEnabled, merchantLogos, aiEnabled } = useSettingsStore();

  const onExport = async () => {
    try {
      await shareCsv(await exportCsv());
    } catch (e) {
      Alert.alert('Export failed', (e as Error).message);
    }
  };

  const onSample = async () => {
    if (!(await isEmpty())) return Alert.alert('Already has data', 'Sample data can only be loaded into an empty app.');
    await seedDemoData();
    Alert.alert('Sample data loaded', 'Have a look around the Home, Activity and Invoices tabs.');
  };

  const onErase = () =>
    Alert.alert('Erase all data?', 'This permanently deletes everything stored by TrackFinance on this phone. It cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Erase', style: 'destructive', onPress: () => clearAllData().then(hydrateSettings) },
    ]);

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
      <Pane title="Sample data">
        <Link title="Load sample data" subtitle="Fill an empty app with example transactions, budgets and invoices" onPress={onSample} />
        <Separator />
        <Link title="Erase all data" subtitle="Delete every transaction, expense, invoice and setting on this phone" onPress={onErase} />
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
          SMS are read and parsed on this phone, and your data is stored only here.
          {aiEnabled
            ? ' The AI coach is on: when you ask it something, a snapshot of your finances (including recent SMS text) is sent to Cloudflare Workers AI to answer.'
            : ' Nothing is uploaded.'}
        </Body>
        <Separator />
        <Row style={{ justifyContent: 'space-between' }}>
          <Body>Merchant logos</Body>
          <Segmented options={['on', 'off'] as const} value={merchantLogos ? 'on' : 'off'} onChange={(v) => setMerchantLogos(v === 'on')} labels={{ on: 'On', off: 'Off' }} />
        </Row>
        <Caption upper={false}>Loads website icons for known companies (sends only the company's web address).</Caption>
        {aiEnabled ? (
          <>
            <Separator />
            <Link title="Turn off AI coach" subtitle="Stops sending data to the assistant" onPress={() => setAiEnabled(false)} />
          </>
        ) : null}
      </Pane>
    </Screen>
  );
}
