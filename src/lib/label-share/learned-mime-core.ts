/**
 * Which file types the "Open label file" picker lists. Pure.
 *
 * The system picker filters by the type the provider reports for a file. For an extension it does not
 * know (.seznik) that is "unknown" (application/octet-stream), or a zip when the file came through
 * a download. Types of real documents are never listed, so PDFs and spreadsheets stay hidden.
 */

export const SEZLABEL_BASE_MIMES: string[] = [
  'application/octet-stream',
  'application/zip',
  'application/x-zip-compressed',
  'application/x-zip',
  'application/vnd.sezprint.label+zip',
  'binary/octet-stream',
];

const SHAPE = /^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/i;
const NEVER = /^(image|video|audio|text)\/|^\*\/\*$|^application\/(pdf|msword|rtf|json|xml|vnd\.(ms-|openxmlformats|oasis|google-apps)|x-pdf)/i;

/** A reported type worth remembering for label files: well-formed and not a known document/media type. */
export function isLearnableMime(mime: string | null | undefined): mime is string {
  const m = (mime ?? '').split(';')[0].trim();
  return SHAPE.test(m) && !NEVER.test(m) && !m.endsWith('/*');
}

/** The picker list: the base types plus the ones learned from this phone. */
export function sezlabelMimes(learned: readonly string[]): string[] {
  const out = [...SEZLABEL_BASE_MIMES];
  for (const m of learned) {
    const clean = m.split(';')[0].trim().toLowerCase();
    if (isLearnableMime(clean) && !out.includes(clean)) out.push(clean);
  }
  return out;
}

/** Learned list after seeing `mime` on a real label file (unchanged when not worth keeping). */
export function learn(learned: readonly string[], mime: string | null | undefined): string[] {
  if (!isLearnableMime(mime)) return [...learned];
  const clean = mime.split(';')[0].trim().toLowerCase();
  return sezlabelMimes(learned).includes(clean) ? [...learned] : [...learned, clean].slice(-8);
}
