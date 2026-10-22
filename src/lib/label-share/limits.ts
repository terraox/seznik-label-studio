/**
 * .seznik label file constants and safety limits. Pure TypeScript (no React Native imports) so
 * everything under src/lib/label-share runs in node tests.
 */

export const SEZLABEL_FORMAT = 'sezlabel';
/** Schema this build writes and the newest schema it can read. */
export const SEZLABEL_SCHEMA_VERSION = 1;
/** Oldest app version that can read a schema-1 file. */
export const SEZLABEL_MIN_APP_VERSION = '1.0.1';
/** Label files are named `name.seznik`. Files made before the rename end in `.sezlabel` and still open. */
export const SEZLABEL_EXTENSION = 'seznik';
export const SEZLABEL_LEGACY_EXTENSION = 'sezlabel';
export const SEZLABEL_MIME = 'application/vnd.sezprint.label+zip';

/** Written into every manifest so a reader knows what the format cannot promise. */
export const SEZLABEL_KNOWN_LIMITS = [
  "The 'Default' font is the phone's system font (San Francisco on iOS, Roboto on Android). Text set in it can measure and wrap differently on the other platform.",
  'Printer settings (printer, dpi, offsets, darkness, speed, gap, flip, grid, ruler) are not part of the file.',
] as const;

export const LIMITS = {
  /** Whole .seznik file. */
  fileBytes: 30 * 1024 * 1024,
  entries: 200,
  totalInflatedBytes: 80 * 1024 * 1024,
  documentJsonBytes: 5 * 1024 * 1024,
  manifestJsonBytes: 256 * 1024,
  previewBytes: 2 * 1024 * 1024,
  imageBytes: 12 * 1024 * 1024,
  imageEdgePx: 8000,
  imagePixels: 40_000_000,
  svgBytes: 256 * 1024,
  entryNameChars: 100,
  /** Largest inflated size over compressed size allowed per entry. */
  maxRatio: 100,
  /** Ratio is only enforced above this inflated size (tiny files compress absurdly well). */
  ratioFloorBytes: 64 * 1024,
  elements: 500,
  tableSide: 10,
  signatureStrokes: 50,
  signaturePoints: 5000,
  stringChars: 10_000,
  idChars: 200,
  nameChars: 200,
  jsonDepth: 32,
  upsColumns: 6,
  bulkSlots: 100,
  serialBatch: 5000,
  userClipart: 50,
  images: 100,
  fontBytes: 8 * 1024 * 1024,
  fonts: 8,
} as const;

export const ALLOWED_DIRS = ['assets/images/', 'assets/clipart/', 'assets/fonts/'] as const;
