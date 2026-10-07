import { Skia, type SkTypeface } from '@shopify/react-native-skia';
import * as FileSystem from 'expo-file-system/legacy';

import { FONT_LIBRARY } from '@/constants/font-library';
import { APP_FONT_MAP } from '@/lib/app-fonts';
import { collectDocumentFontNames, lookupFontFamily } from '@/lib/fonts/lookup';
import { useInstalledFontStore } from '@/stores/installed-font-store';

import {
  getPrintTypeface,
  hasPrintTypeface,
  registerFileBackedTypeface,
  setPrintTypeface,
} from './print-typeface-map';

let bundledReady = false;
let loading: Promise<void> | null = null;

async function loadBundledFace(name: string, moduleId: number): Promise<void> {
  if (hasPrintTypeface(name)) return;
  // Bundled faces ship as Metro assets; resolve the local file at print time.
  const assetPackage = 'expo-asset';
  const { Asset } = require(assetPackage) as {
    Asset: {
      fromModule: (id: number) => {
        localUri: string | null;
        downloadAsync: () => Promise<unknown>;
      };
    };
  };
  const asset = Asset.fromModule(moduleId);
  if (!asset.localUri) await asset.downloadAsync();
  const uri = asset.localUri;
  if (!uri) throw new Error(`Print font ${name} has no local file.`);
  const data = await Skia.Data.fromURI(uri);
  const face = Skia.Typeface.MakeFreeTypeFaceFromData(data);
  if (!face) throw new Error(`Print font ${name} could not be decoded.`);
  setPrintTypeface(name, face);
}

async function decodeFileFace(uri: string): Promise<SkTypeface | null> {
  const data = await Skia.Data.fromURI(uri);
  return Skia.Typeface.MakeFreeTypeFaceFromData(data);
}

/** Load the same faces the editor bundles, so headless print is not a block font. */
export function ensurePrintTypefaces(): Promise<void> {
  if (bundledReady) return Promise.resolve();
  if (!loading) {
    loading = Promise.all(
      Object.entries(APP_FONT_MAP).map(([name, moduleId]) => loadBundledFace(name, moduleId as number)),
    )
      .then(() => {
        bundledReady = true;
      })
      .catch((err) => {
        loading = null;
        throw err;
      });
  }
  return loading;
}

/**
 * Decode a user TTF/OTF into the print face map.
 * A missing or corrupt file returns false; callers keep the Inter fallback.
 */
export async function registerPrintTypeface(familyKey: string, fileUri: string): Promise<boolean> {
  if (!familyKey || !fileUri) return false;
  if (hasPrintTypeface(familyKey)) return true;
  try {
    return await registerFileBackedTypeface(familyKey, fileUri, decodeFileFace);
  } catch (err) {
    console.warn('[print-typeface] decode failed', familyKey, err);
    return false;
  }
}

/**
 * Bundled faces, then any downloaded/imported face the label actually uses.
 * Josh (and other headless raster jobs) draw these glyphs into the bitmap.
 */
export async function ensurePrintTypefacesForDocument(doc: {
  elements: readonly object[];
}): Promise<void> {
  try {
    await ensurePrintTypefaces();
  } catch (err) {
    console.warn('[print-typeface] bundled faces failed', err);
  }
  const installed = useInstalledFontStore.getState().items;
  for (const name of collectDocumentFontNames(doc)) {
    const family = lookupFontFamily(name, FONT_LIBRARY, installed);
    if (!family || hasPrintTypeface(family)) continue;
    const record = installed.find((font) => font.familyKey === family);
    if (!record?.fileUri) continue;
    try {
      const info = await FileSystem.getInfoAsync(record.fileUri);
      if (!info.exists) {
        console.warn('[print-typeface] missing file, using Inter', family);
        continue;
      }
      const ok = await registerPrintTypeface(family, record.fileUri);
      if (!ok) console.warn('[print-typeface] could not decode, using Inter', family);
    } catch (err) {
      console.warn('[print-typeface] skip', family, err);
    }
  }
}

/**
 * Families the label asked for that are not in the print map.
 * Default/Barcode resolve to nothing and stay on Inter. A named face that
 * failed to load must not be silently drawn as Inter.
 */
export function missingPrintTypefaces(doc: { elements: readonly object[] }): string[] {
  const installed = useInstalledFontStore.getState().items;
  const missing: string[] = [];
  for (const name of collectDocumentFontNames(doc)) {
    const family = lookupFontFamily(name, FONT_LIBRARY, installed);
    if (!family || hasPrintTypeface(family)) continue;
    missing.push(family);
  }
  return missing;
}

/** Embedded face for a FONT_LIBRARY family. Default and barcode text use Inter. */
export function printTypeface(family?: string, bold?: boolean): SkTypeface | null {
  return getPrintTypeface(family, bold) as SkTypeface | null;
}
