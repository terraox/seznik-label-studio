import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'sezlabel-learned-mimes';

export async function loadLearnedMimes(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((m): m is string => typeof m === 'string').slice(0, 8) : [];
  } catch {
    return [];
  }
}

export async function saveLearnedMimes(list: readonly string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Learning is a convenience; the picker still works without it.
  }
}
