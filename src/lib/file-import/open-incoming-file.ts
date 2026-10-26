import { router } from 'expo-router';
import { Alert } from 'react-native';

import { commitImport, readLabelFile } from '@/lib/label-share/native';
import { importNote } from '@/lib/label-share/summary';
import { useIncomingFileStore, type IncomingFile } from '@/stores/incoming-file-store';

/**
 * Open a file another app sent to Seznik ("Open with" or share) on the screen that handles its type:
 * a spreadsheet goes to Data File, a PDF to Print PDF, a .seznik file straight onto the canvas.
 */
export async function openIncomingFile(file: IncomingFile): Promise<void> {
  if (file.kind === 'excel') {
    // Data File picks the pending spreadsheet up and clears it once it starts importing.
    router.push('/data-file');
    return;
  }
  useIncomingFileStore.getState().clearPending();
  if (file.kind === 'pdf') {
    router.push({ pathname: '/pdf', params: { docName: file.name, docUri: file.uri } });
    return;
  }
  try {
    const parsed = await readLabelFile(file.uri);
    const { doc, missing, installedFonts } = await commitImport(parsed);
    router.push({ pathname: '/edit', params: { labelId: doc.id } });
    const note = importNote(missing, parsed.paletteChanged, installedFonts);
    if (note) Alert.alert('Label opened', note);
  } catch (error) {
    Alert.alert("Can't open this label", error instanceof Error ? error.message : 'Could not open that file.');
  }
}
