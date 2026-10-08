/**
 * Durable user files for Sez Print.
 *
 * Working copies: `{FileSystem.documentDirectory}sezprint/<subdir>/`
 * iOS Files app: On My iPhone → Sez Print → sezprint (UIFileSharingEnabled).
 * Android file manager: Internal storage → Documents → sezprint (best-effort mirror).
 *
 * Never falls back to cacheDirectory.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import {
  ANDROID_PUBLIC_SEZPRINT_ROOT,
  androidPublicSubdirUri,
  fileNameFromUri,
  isInsideSezprint,
  type SezprintSubdir,
  sezprintSubdirUri,
} from '@/lib/user-files/paths';

function documentRoot(): string {
  const root = FileSystem.documentDirectory;
  if (!root) throw new Error('This device cannot store files. Documents storage is unavailable.');
  return root;
}

export async function ensureSezprintDir(subdir: SezprintSubdir): Promise<string> {
  const dir = sezprintSubdirUri(documentRoot(), subdir);
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  return dir;
}

async function mirrorToPublicDocuments(subdir: SezprintSubdir, sourceUri: string, fileName: string): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const rootInfo = await FileSystem.getInfoAsync(ANDROID_PUBLIC_SEZPRINT_ROOT);
    if (!rootInfo.exists) {
      await FileSystem.makeDirectoryAsync(ANDROID_PUBLIC_SEZPRINT_ROOT, { intermediates: true });
    }
    const dir = androidPublicSubdirUri(subdir);
    const dirInfo = await FileSystem.getInfoAsync(dir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
    const dest = `${dir}${fileName}`;
    const existing = await FileSystem.getInfoAsync(dest);
    if (existing.exists) {
      await FileSystem.deleteAsync(dest, { idempotent: true });
    }
    await FileSystem.copyAsync({ from: sourceUri, to: dest });
  } catch {
    // Scoped storage often blocks this path. The documentDirectory copy remains the source of truth.
  }
}

async function deletePublicTwin(subdir: SezprintSubdir, fileName: string): Promise<void> {
  if (Platform.OS !== 'android' || !fileName) return;
  try {
    await FileSystem.deleteAsync(`${androidPublicSubdirUri(subdir)}${fileName}`, { idempotent: true });
  } catch {
    // Public mirror may never have been created.
  }
}

function subdirFromUri(uri: string): SezprintSubdir | null {
  const match = uri.match(/\/sezprint\/(clipart|fonts|labels|excel|pdf|images)\//);
  return (match?.[1] as SezprintSubdir | undefined) ?? null;
}

/** Best-effort copy of an existing sezprint file into Documents/sezprint on Android. */
export async function publishSezprintFile(subdir: SezprintSubdir, fileUri: string): Promise<void> {
  await mirrorToPublicDocuments(subdir, fileUri, fileNameFromUri(fileUri));
}

/** Copy an import into sezprint. Returns the stable documentDirectory URI. */
export async function copyImportIntoSezprint(
  subdir: SezprintSubdir,
  sourceUri: string,
  fileName: string,
): Promise<string> {
  if (isInsideSezprint(sourceUri, subdir)) return sourceUri;
  const dir = await ensureSezprintDir(subdir);
  const dest = `${dir}${fileName}`;
  const existing = await FileSystem.getInfoAsync(dest);
  if (existing.exists) {
    await FileSystem.deleteAsync(dest, { idempotent: true });
  }
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  await mirrorToPublicDocuments(subdir, dest, fileName);
  return dest;
}

export async function writeTextIntoSezprint(
  subdir: SezprintSubdir,
  fileName: string,
  contents: string,
): Promise<string> {
  const dir = await ensureSezprintDir(subdir);
  const dest = `${dir}${fileName}`;
  await FileSystem.writeAsStringAsync(dest, contents);
  await mirrorToPublicDocuments(subdir, dest, fileName);
  return dest;
}

/** Idempotent. Missing files are ignored. Also removes the Android Documents twin when the URI is under sezprint. */
export async function deleteSezprintFile(fileUri: string | undefined | null): Promise<void> {
  if (!fileUri) return;
  const name = fileNameFromUri(fileUri);
  const subdir = subdirFromUri(fileUri);
  try {
    await FileSystem.deleteAsync(fileUri, { idempotent: true });
  } catch {
    // Already gone.
  }
  if (subdir) await deletePublicTwin(subdir, name);
}

export async function readSezprintText(fileUri: string): Promise<string | null> {
  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists) return null;
    return await FileSystem.readAsStringAsync(fileUri);
  } catch {
    return null;
  }
}

/** Copy leftover files from an old app-private folder into a sezprint subdir. */
export async function migrateDirectoryIntoSezprint(
  legacyDir: string | null,
  subdir: SezprintSubdir,
): Promise<void> {
  if (!legacyDir) return;
  try {
    const info = await FileSystem.getInfoAsync(legacyDir);
    if (!info.exists || !info.isDirectory) return;
    const names = await FileSystem.readDirectoryAsync(legacyDir);
    if (names.length === 0) return;
    const destDir = await ensureSezprintDir(subdir);
    for (const name of names) {
      const from = `${legacyDir}${name}`;
      const to = `${destDir}${name}`;
      const already = await FileSystem.getInfoAsync(to);
      if (already.exists) continue;
      await FileSystem.copyAsync({ from, to });
      await mirrorToPublicDocuments(subdir, to, name);
    }
  } catch {
    // Leave legacy files in place if the copy fails.
  }
}

export function legacyDir(name: string): string | null {
  const root = FileSystem.documentDirectory;
  if (!root) return null;
  return `${root}${name}/`;
}
