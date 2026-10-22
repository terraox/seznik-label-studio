/**
 * Files an import has just written but the label store does not name yet. The image cleanup
 * (`sweepEditorImageFiles`) keeps these, so it cannot delete a picture in the moment between
 * "file written" and "label saved". Released once the label is in the store (or the import failed).
 */

const protectedUris = new Set<string>();

export function protectImportUris(uris: readonly string[]): void {
  for (const uri of uris) protectedUris.add(uri);
}

export function releaseImportUris(uris: readonly string[]): void {
  for (const uri of uris) protectedUris.delete(uri);
}

export function protectedImportUris(): string[] {
  return [...protectedUris];
}
