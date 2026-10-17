import { addSmsListener } from '../../modules/tf-sms';
import { processIncoming } from './smsProcessor';

/** Parse SMS the instant they arrive while the app is running. Returns an unsubscribe function. */
export function startSmsListener(): () => void {
  const sub = addSmsListener((sms) => {
    processIncoming(sms).catch((e) => console.warn('[TrackFinance] incoming SMS failed', e));
  });
  return () => sub?.remove();
}
