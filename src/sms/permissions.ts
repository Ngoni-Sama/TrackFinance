import { PermissionsAndroid, Platform } from 'react-native';

export type SmsPermissionResult = 'granted' | 'denied' | 'blocked';

/** Ask for READ_SMS + RECEIVE_SMS. Call only after the in-app disclosure was accepted. */
export async function requestSmsPermissions(): Promise<SmsPermissionResult> {
  if (Platform.OS !== 'android') return 'denied';
  const res = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.READ_SMS,
    PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
  ]);
  const read = res[PermissionsAndroid.PERMISSIONS.READ_SMS];
  if (read === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
  return read === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ? 'blocked' : 'denied';
}

export async function hasSmsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
}
