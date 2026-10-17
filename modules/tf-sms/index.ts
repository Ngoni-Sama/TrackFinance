import { EventEmitter, requireOptionalNativeModule, Subscription } from 'expo-modules-core';

export interface RawSms {
  id?: string;
  sender: string;
  body: string;
  /** Epoch ms the SMS was received. */
  date: number;
}

interface TfSmsNative {
  hasPermission(): boolean;
  readInbox(sinceMs: number, limit: number, senderFilters: string[]): Promise<RawSms[]>;
}

// Optional so the JS bundle still loads (manual-only mode) on builds without the native module.
const native = requireOptionalNativeModule<TfSmsNative>('TfSms');
const emitter = native ? new EventEmitter(native as never) : null;

export const isAvailable = native != null;

export function hasPermission(): boolean {
  return native?.hasPermission() ?? false;
}

export async function readInbox(sinceMs: number, limit = 500, senderFilters: string[] = []): Promise<RawSms[]> {
  if (!native) return [];
  return native.readInbox(sinceMs, limit, senderFilters);
}

export function addSmsListener(listener: (sms: RawSms) => void): Subscription | null {
  return emitter?.addListener<RawSms>('onSmsReceived', listener) ?? null;
}
