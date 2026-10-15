import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

/** A spreadsheet sent to the app from another app. `error` is set when it could not be read. */
export type SharedFile = {
  name?: string;
  uri?: string;
  size?: number;
  mimeType?: string | null;
  error?: string;
};

type Subscription = { remove: () => void };

type NativeShareTarget = {
  consumeSharedFileAsync(): Promise<SharedFile | null>;
  addListener(event: 'onSharedFile', listener: (file: SharedFile) => void): Subscription;
};

let cached: NativeShareTarget | null | undefined;

function getNative(): NativeShareTarget | null {
  if (Platform.OS !== 'android') return null;
  if (cached !== undefined) return cached;
  try {
    cached = requireNativeModule<NativeShareTarget>('ShareTarget');
  } catch {
    cached = null;
  }
  return cached;
}

/** The file that launched the app, once. Null when the app was opened normally. */
export async function consumeSharedFileAsync(): Promise<SharedFile | null> {
  const native = getNative();
  if (!native) return null;
  try {
    return (await native.consumeSharedFileAsync()) ?? null;
  } catch {
    return null;
  }
}

/** Files shared while the app is already open. */
export function addSharedFileListener(listener: (file: SharedFile) => void): Subscription {
  const native = getNative();
  if (!native) return { remove: () => {} };
  return native.addListener('onSharedFile', listener);
}
