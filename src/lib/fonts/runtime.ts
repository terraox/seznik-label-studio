import * as FileSystem from 'expo-file-system/legacy';
import * as Font from 'expo-font';

import { useInstalledFontStore } from '@/stores/installed-font-store';

/** Register persisted TTF/OTF files with expo-font so the canvas and ViewShot match print. */
export async function loadInstalledFontsIntoRuntime(): Promise<void> {
  const items = useInstalledFontStore.getState().items;
  if (items.length === 0) return;
  const map: Record<string, { uri: string }> = {};
  for (const item of items) {
    try {
      const info = await FileSystem.getInfoAsync(item.fileUri);
      if (!info.exists) continue;
      map[item.familyKey] = { uri: item.fileUri };
    } catch {
      // Skip a record whose file cannot be stat'd.
    }
  }
  if (Object.keys(map).length === 0) return;
  await Font.loadAsync(map);
  useInstalledFontStore.getState().touch();
}

export function startInstalledFontHydration(): () => void {
  const load = () => {
    void loadInstalledFontsIntoRuntime().catch((err) => {
      console.warn('[fonts] could not load installed faces', err);
    });
  };
  const unsubscribe = useInstalledFontStore.persist.onFinishHydration(load);
  if (useInstalledFontStore.persist.hasHydrated()) load();
  return unsubscribe;
}
