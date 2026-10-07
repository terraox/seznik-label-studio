/**
 * In-memory print faces. Isolated from Skia so registration can be tested
 * without the native module. `registerPrintTypeface` in print-typeface.ts
 * decodes a TTF and stores the face here.
 */

type PrintFace = { dispose?: () => void };

const faces = new Map<string, PrintFace>();
const fileUris = new Map<string, string>();

export function setPrintTypeface(family: string, face: PrintFace): void {
  faces.set(family, face);
}

export function hasPrintTypeface(family: string): boolean {
  return faces.has(family);
}

export function getPrintTypeface(family?: string, bold?: boolean): PrintFace | null {
  if (family && faces.has(family)) return faces.get(family) ?? null;
  if (bold && faces.has('Inter_600SemiBold')) return faces.get('Inter_600SemiBold') ?? null;
  return faces.get('Inter_400Regular') ?? null;
}

export function dropPrintTypeface(family: string): void {
  faces.delete(family);
  fileUris.delete(family);
}

export function fileTypefaceUri(family: string): string | undefined {
  return fileUris.get(family);
}

export function clearPrintTypefacesForTests(): void {
  faces.clear();
  fileUris.clear();
}

/** Remember a file-backed face after it decodes. Used by registerPrintTypeface. */
export async function registerFileBackedTypeface(
  familyKey: string,
  fileUri: string,
  decode: (uri: string) => Promise<PrintFace | null>,
): Promise<boolean> {
  fileUris.set(familyKey, fileUri);
  const face = await decode(fileUri);
  if (!face) return false;
  faces.set(familyKey, face);
  return true;
}
