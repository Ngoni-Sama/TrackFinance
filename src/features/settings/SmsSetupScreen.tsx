import { format } from 'date-fns';
import React, { useState } from 'react';
import { Alert, Linking, Modal, View } from 'react-native';
import { isAvailable } from '../../../modules/tf-sms';
import { Button, Screen } from '../../components/Controls';
import { Pane } from '../../components/Pane';
import { PercentBar } from '../../components/PercentStat';
import { Body, Caption, Highlight, Title } from '../../components/Typography';
import { useSettingsStore } from '../../core/settingsStore';
import { margin, radius, useTheme } from '../../core/theme';
import { setLastSyncAt, setSmsEnabled } from '../../data/settings';
import { stopBackgroundSync } from '../../sms/backgroundSync';
import { requestSmsPermissions } from '../../sms/permissions';
import { BACKFILL_DAYS, syncSmsInbox, SyncProgress } from '../../sms/smsProcessor';

/** Prominent disclosure shown before the Android permission prompt (Google Play requirement). */
function Disclosure({ visible, onAccept, onDecline }: { visible: boolean; onAccept: () => void; onDecline: () => void }) {
  const t = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDecline}>
      <View style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: margin * 2 }}>
        <View style={{ backgroundColor: t.pane, borderRadius: radius, padding: margin * 2 }}>
          <Title>TrackFinance reads your SMS</Title>
          <Body style={{ marginTop: margin }}>
            To log your money automatically, TrackFinance reads SMS from EcoCash, OneMoney, Kashagi, Omari and Zimbabwean banks, and
            picks out the amount, merchant, reference and balance.
          </Body>
          <Body style={{ marginTop: margin }}>• Only messages from those senders are used. Personal SMS are skipped.</Body>
          <Body>• Everything is processed on this phone. No SMS content leaves your device.</Body>
          <Body>• You can turn this off any time in Settings.</Body>
          <Button title="Continue" onPress={onAccept} style={{ marginTop: margin * 2 }} />
          <Button title="Not now" variant="secondary" onPress={onDecline} />
        </View>
      </View>
    </Modal>
  );
}

export function SmsSetupScreen() {
  const t = useTheme();
  const { smsEnabled, lastSyncAt } = useSettingsStore();
  const [disclosure, setDisclosure] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [scanning, setScanning] = useState(false);

  const scan = async (fromScratch: boolean) => {
    setScanning(true);
    setProgress({ scanned: 0, added: 0 });
    const start = Date.now() - BACKFILL_DAYS * 24 * 3600 * 1000;
    try {
      const result = await syncSmsInbox({ since: fromScratch ? start : undefined, onProgress: setProgress });
      setProgress(result);
    } catch (e) {
      Alert.alert('Scan failed', (e as Error).message);
    } finally {
      setScanning(false);
    }
  };

  const enable = async () => {
    setDisclosure(false);
    const res = await requestSmsPermissions();
    if (res === 'granted') {
      await setSmsEnabled(true);
      await scan(false);
    } else if (res === 'blocked') {
      Alert.alert('SMS permission is off', 'Allow SMS for TrackFinance in Android settings to turn on tracking.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open settings', onPress: () => Linking.openSettings() },
      ]);
    }
  };

  const disable = async () => {
    await setSmsEnabled(false);
    await stopBackgroundSync().catch(() => undefined);
  };

  const rescan = () =>
    Alert.alert('Re-scan inbox?', `Reads the last ${BACKFILL_DAYS} days again. Transactions already logged are not duplicated.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Re-scan',
        onPress: async () => {
          await setLastSyncAt(0);
          await scan(true);
        },
      },
    ]);

  if (!isAvailable) {
    return (
      <Screen>
        <Pane title="Not available in this build">
          <Body muted>SMS reading needs the TrackFinance Android build (expo run:android). Expo Go cannot read SMS.</Body>
        </Pane>
      </Screen>
    );
  }

  return (
    <Screen>
      <Disclosure visible={disclosure} onAccept={enable} onDecline={() => setDisclosure(false)} />
      <Pane title="Status">
        <Highlight value={smsEnabled ? 'On' : 'Off'} suffix={smsEnabled ? 'logging mobile money SMS' : 'manual entries only'} color={smsEnabled ? t.ok : t.caption} />
        <Caption upper={false} style={{ marginTop: 4 }}>
          {lastSyncAt ? `Up to date to ${format(lastSyncAt, 'd MMM yyyy, HH:mm')}` : 'Inbox not scanned yet'}
        </Caption>
      </Pane>

      {progress && (
        <Pane title={scanning ? 'Scanning inbox…' : 'Last scan'}>
          <PercentBar
            percentage={progress.scanned ? (progress.added / progress.scanned) * 100 : 0}
            label="of scanned SMS were new transactions"
            footnote={`${progress.added} added from ${progress.scanned} SMS`}
          />
        </Pane>
      )}

      {smsEnabled ? (
        <>
          <Button title="Sync now" onPress={() => scan(false)} loading={scanning} />
          <Button title={`Re-scan last ${BACKFILL_DAYS} days`} variant="secondary" onPress={rescan} disabled={scanning} />
          <Button title="Turn off SMS tracking" variant="danger" onPress={disable} disabled={scanning} />
        </>
      ) : (
        <Button title="Turn on SMS tracking" onPress={() => setDisclosure(true)} />
      )}

      <Pane title="What gets read" style={{ marginTop: margin }}>
        <Body muted>EcoCash (+263164…), Kashagi loans (+263165), Omari savings, OneMoney, and CBZ, Steward, FBC, ZB, NMB, Stanbic, BancABC. Airtime and network alerts from Econet are ignored.</Body>
      </Pane>
    </Screen>
  );
}
