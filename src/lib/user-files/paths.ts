/**
 * User imports live under a folder named `sezprint`.
 *
 * iOS: `{documentDirectory}sezprint/…` is shown in the Files app once
 * UIFileSharingEnabled is set (On My iPhone → Sez Print → sezprint).
 *
 * Android: the same tree is the working copy. A mirror is also written to
 * `Documents/sezprint/` so a file manager can open Internal storage → Documents → sezprint.
 * Imports are never written to cacheDirectory.
 */

export const SEZPRINT_DIR_NAME = 'sezprint';

export const SEZPRINT_SUBDIRS = [
  'clipart',
  'fonts',
  'labels',
  'excel',
  'pdf',
  'images',
  'print-history',
] as const;

export type SezprintSubdir = (typeof SEZPRINT_SUBDIRS)[number];

/** Public Android Documents tree. Direct writes may fail on scoped storage; callers treat that as best-effort. */
export const ANDROID_PUBLIC_SEZPRINT_ROOT = 'file:///storage/emulated/0/Documents/sezprint/';

export function joinDir(root: string, ...parts: string[]): string {
  const base = root.endsWith('/') ? root : `${root}/`;
  return `${base}${parts.filter(Boolean).join('/')}`;
}

export function sezprintSubdirUri(documentDirectory: string, subdir: SezprintSubdir): string {
  return joinDir(documentDirectory, SEZPRINT_DIR_NAME, subdir) + '/';
}

export function androidPublicSubdirUri(subdir: SezprintSubdir): string {
  return joinDir(ANDROID_PUBLIC_SEZPRINT_ROOT, subdir) + '/';
}

export function isInsideSezprint(uri: string, subdir?: SezprintSubdir): boolean {
  const marker = subdir ? `/${SEZPRINT_DIR_NAME}/${subdir}/` : `/${SEZPRINT_DIR_NAME}/`;
  return uri.includes(marker) || uri.includes(`${SEZPRINT_DIR_NAME}/${subdir ?? ''}`);
}

export function fileNameFromUri(uri: string): string {
  const trimmed = uri.split('?')[0] ?? uri;
  const parts = trimmed.split(/[/\\]/);
  return parts[parts.length - 1] || trimmed;
}

export function safeImportFileName(id: string, originalName: string, fallbackExt: string): string {
  const base = originalName.split(/[/\\]/).pop() ?? originalName;
  const dot = base.lastIndexOf('.');
  const rawExt = dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
  const ext = /^[a-z0-9]{1,8}$/.test(rawExt) ? rawExt : fallbackExt;
  const stem = id.replace(/[^a-zA-Z0-9_-]/g, '') || 'file';
  return `${stem}.${ext}`;
}
