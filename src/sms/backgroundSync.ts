import BackgroundFetch, { HeadlessEvent } from 'react-native-background-fetch';
import { syncSmsInbox } from './smsProcessor';

async function runSync(taskId: string) {
  try {
    await syncSmsInbox();
  } catch (e) {
    console.warn('[TrackFinance] SMS sync failed', e);
  }
  BackgroundFetch.finish(taskId);
}

/** Periodic inbox sync while the app is backgrounded (Android minimum is 15 minutes). */
export async function startBackgroundSync() {
  await BackgroundFetch.configure(
    {
      minimumFetchInterval: 15,
      stopOnTerminate: false,
      startOnBoot: true,
      enableHeadless: true,
      requiredNetworkType: BackgroundFetch.NETWORK_TYPE_NONE,
    },
    runSync,
    (taskId) => BackgroundFetch.finish(taskId),
  );
}

export async function stopBackgroundSync() {
  await BackgroundFetch.stop();
}

/** Registered in index.ts; runs when Android wakes a terminated app. */
export async function headlessSync(event: HeadlessEvent) {
  if (event.timeout) {
    BackgroundFetch.finish(event.taskId);
    return;
  }
  await runSync(event.taskId);
}

export function registerHeadlessSync() {
  BackgroundFetch.registerHeadlessTask(headlessSync);
}
