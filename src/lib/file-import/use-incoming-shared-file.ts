import { useEffect } from 'react';
import { Alert } from 'react-native';
import { addSharedFileListener, consumeSharedFileAsync, type SharedFile } from 'share-target';

import { DOCUMENT_PRESETS, extensionFromName } from '@/lib/file-import/mime-presets';
import { useIncomingFileStore } from '@/stores/incoming-file-store';

/** Turn a native share into a pending import, or tell the user why it cannot be imported. */
export function handleSharedFile(file: SharedFile | null): void {
  if (!file) return;
  if (file.error || !file.uri || !file.name) {
    Alert.alert('Could not import', file.error ?? 'The shared file could not be read.');
    return;
  }
  if (!DOCUMENT_PRESETS.excel.extensions.has(extensionFromName(file.name))) {
    Alert.alert('Invalid File', 'Please share an Excel workbook (.xlsx / .xls) or CSV file.');
    return;
  }
  useIncomingFileStore.getState().setPending({ name: file.name, uri: file.uri, size: file.size });
}

/** Android share target: a spreadsheet sent from Google Sheets, Drive or a file manager. */
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
