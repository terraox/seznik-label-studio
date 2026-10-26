import { useEffect } from 'react';
import { Alert } from 'react-native';
import { addSharedFileListener, consumeSharedFileAsync, type SharedFile } from 'share-target';

import { classifyIncomingFile } from '@/lib/file-import/classify-incoming-file';
import { useIncomingFileStore } from '@/stores/incoming-file-store';

/** Turn a native share or "Open with" into a pending file, or tell the user why it cannot be opened. */
export function handleSharedFile(file: SharedFile | null): void {
  if (!file) return;
  if (file.error || !file.uri || !file.name) {
    Alert.alert('Could not open', file.error ?? 'The file could not be read.');
    return;
  }
  const kind = classifyIncomingFile(file.name);
  if (!kind) {
    Alert.alert('Unsupported file', 'Seznik opens Excel (.xlsx, .xls, .csv), PDF and .seznik label files.');
    return;
  }
  useIncomingFileStore.getState().setPending({ kind, name: file.name, uri: file.uri, size: file.size });
}

/** Android share target and "Open with": a spreadsheet, PDF or .seznik file sent from another app. */
export function useIncomingSharedFile(): void {
  useEffect(() => {
    let active = true;
    void consumeSharedFileAsync().then((file) => {
      if (active) handleSharedFile(file);
    });
    const subscription = addSharedFileListener(handleSharedFile);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
}
