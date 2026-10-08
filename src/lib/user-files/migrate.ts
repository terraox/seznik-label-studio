import { useInstalledFontStore } from '@/stores/installed-font-store';
import { useLabelStore } from '@/stores/label-store';
import { legacyDir, migrateDirectoryIntoSezprint } from '@/lib/user-files/root';
import { sezprintSubdirUri } from '@/lib/user-files/paths';
import * as FileSystem from 'expo-file-system/legacy';

function rewriteUri(uri: string, from: string, to: string): string {
  if (!uri.includes(from)) return uri;
  return uri.replace(from, to);
}

/**
 * Move older app-private folders into sezprint and point stored URIs at the new files.
 * Safe to call more than once.
 */
export async function migrateLegacyUserFiles(): Promise<void> {
  const root = FileSystem.documentDirectory;
  if (!root) return;

  await migrateDirectoryIntoSezprint(legacyDir('user-fonts'), 'fonts');
  await migrateDirectoryIntoSezprint(legacyDir('sez-editor-images'), 'images');

  const fontsDir = sezprintSubdirUri(root, 'fonts');
  const imagesDir = sezprintSubdirUri(root, 'images');

  const fonts = useInstalledFontStore.getState().items;
  const movedFonts = fonts.map((font) => {
    if (!font.fileUri.includes('/user-fonts/')) return font;
    const name = font.fileUri.split('/').pop() ?? '';
    return { ...font, fileUri: `${fontsDir}${name}` };
  });
  if (movedFonts.some((font, index) => font.fileUri !== fonts[index]?.fileUri)) {
    useInstalledFontStore.setState({ items: movedFonts });
  }

  const documents = useLabelStore.getState().documents;
  const rewriteElements = (elements: { uri?: string; printUri?: string }[]) =>
    elements.map((element) => {
      if (!element.uri && !element.printUri) return element;
      const uri = element.uri ? rewriteUri(element.uri, 'sez-editor-images/', 'sezprint/images/') : element.uri;
      const printUri = element.printUri
        ? rewriteUri(element.printUri, 'sez-editor-images/', 'sezprint/images/')
        : element.printUri;
      if (uri === element.uri && printUri === element.printUri) return element;
      return { ...element, uri, printUri };
    });

  let labelsChanged = false;
  const nextDocs = documents.map((doc) => {
    const elements = rewriteElements(doc.elements as { uri?: string; printUri?: string }[]);
    const panels = doc.ups?.panels.map((panel) =>
      rewriteElements(panel as { uri?: string; printUri?: string }[]),
    );
    const elementsChanged = elements.some((el, i) => el !== doc.elements[i]);
    const panelsChanged = Boolean(
      panels?.some((panel, i) => panel.some((el, j) => el !== doc.ups?.panels[i]?.[j])),
    );
    if (!elementsChanged && !panelsChanged) return doc;
    labelsChanged = true;
    return {
      ...doc,
      elements: elements as typeof doc.elements,
      ups: doc.ups && panels ? { ...doc.ups, panels: panels as typeof doc.ups.panels } : doc.ups,
    };
  });
  if (labelsChanged) useLabelStore.setState({ documents: nextDocs });

  void imagesDir;
}
