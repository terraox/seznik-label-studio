import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

/** 'android' | 'ios' | 'web' as the admin desk shows it; anything else is not reported. */
export function appPlatform(): 'android' | 'ios' | 'web' | null {
  return Platform.OS === 'android' || Platform.OS === 'ios' || Platform.OS === 'web' ? Platform.OS : null;
}

/** Headers every call to our server carries, so the desk knows the version and phone type. */
export function appHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const version = Constants.expoConfig?.version ?? Constants.nativeAppVersion;
  if (version) headers['x-app-version'] = String(version);
  const build = Number(Constants.nativeBuildVersion);
  if (Number.isFinite(build) && build > 0) headers['x-app-build'] = String(build);
  const platform = appPlatform();
  if (platform) headers['x-app-platform'] = platform;
  // e.g. "Samsung SM-A546E"; header values must be plain ASCII.
  const device = [Device.brand, Device.modelName].filter(Boolean).join(' ').replace(/[^\x20-\x7E]/g, '').trim();
  if (device) headers['x-app-device'] = device.slice(0, 60);
  return headers;
}
