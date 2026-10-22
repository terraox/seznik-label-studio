import { router } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
import { Alert } from 'react-native';

import { useDocumentSourcePicker } from '@/lib/file-import/use-document-source-picker';
import { isLabelFileName } from './file-name';
import { learn, sezlabelMimes } from './learned-mime-core';
import { loadLearnedMimes, saveLearnedMimes } from './learned-mime';
import { commitImport, readLabelFile } from './native';
import { importNote } from './summary';

const askShowAll = () =>
  new Promise<boolean>((resolve) => {
    Alert.alert('Can\'t see your file?', 'Show every file once. Next time your label files will be listed on their own.', [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Show all files', onPress: () => resolve(true) },
    ]);
  });

/**
 * "Open label file": choose This Device or Google Drive, pick a label file, add it as a new label and
 * go straight to the canvas, with a note about anything the phone lacks (fonts, clipart).
 * The first picker lists only unknown-type and zip files, so PDFs and spreadsheets do not show. If the
 * phone reports a different type for .sezlabel, "Show all files" finds it once and the type is learned.
 */
export function useOpenLabelFile(navigate: 'push' | 'replace' = 'push'): {
  openLabelFile: () => Promise<void>;
  documentSourceSheet: ReactNode;
} {
  const { pickDocumentWithSource, documentSourceSheet } = useDocumentSourcePicker();

  const openLabelFile = useCallback(async () => {
    try {
      const learned = await loadLearnedMimes();
      let picked = await pickDocumentWithSource({ preset: 'sezlabel', mimeTypes: sezlabelMimes(learned) });
      if (!picked.ok && picked.reason === 'cancelled') {
        if (!(await askShowAll())) return;
        picked = await pickDocumentWithSource({ preset: 'sezlabel', mimeTypes: ['*/*'] });
      }
      if (!picked.ok) {
        if (picked.reason === 'invalid') Alert.alert('Open label file', 'Please choose a .sezlabel file.');
        return;
      }
      if (!isLabelFileName(picked.name)) {
        Alert.alert('Open label file', 'That is not a .sezlabel file. Please choose a file ending in .sezlabel.');
        return;
      }
      const parsed = await readLabelFile(picked.uri);
      const next = learn(learned, picked.mimeType);
      if (next.length !== learned.length) void saveLearnedMimes(next);
      const { doc, missing, installedFonts } = await commitImport(parsed);
      const target = { pathname: '/edit' as const, params: { labelId: doc.id } };
      if (navigate === 'replace') router.replace(target);
      else router.push(target);
      const note = importNote(missing, parsed.paletteChanged, installedFonts);
      if (note) Alert.alert('Label opened', note);
    } catch (error) {
      Alert.alert("Can't open this label", error instanceof Error ? error.message : 'Could not open that file.');
    }
  }, [pickDocumentWithSource, navigate]);

  return { openLabelFile, documentSourceSheet };
}
