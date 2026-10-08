import { FONT_LIBRARY } from '@/constants/font-library';
import type { InstalledFontRecord } from '@/lib/fonts/types';

import { isFontNameReady as isFontNameReadyInLibrary, needsFontDownload as needsFontDownloadInLibrary } from '@/lib/fonts/availability';

export function isFontNameReady(
  name: string | undefined,
  installed: readonly InstalledFontRecord[] = [],
): boolean {
  return isFontNameReadyInLibrary(name, installed, FONT_LIBRARY);
}

export function needsFontDownload(
  name: string,
  installed: readonly InstalledFontRecord[] = [],
): boolean {
  return needsFontDownloadInLibrary(name, installed, FONT_LIBRARY);
}
