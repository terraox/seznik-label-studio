import { SEZLABEL_BASE_MIMES } from '@/lib/label-share/learned-mime-core';

export type DocumentPreset = 'image' | 'excel' | 'csv' | 'pdf' | 'font' | 'svg' | 'clipart' | 'sezlabel' | 'any';

export type DocumentPresetConfig = {
  mimeTypes: string[];
  extensions: ReadonlySet<string>;
};

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'bmp', 'tif', 'tiff'];
const EXCEL_EXTENSIONS = ['xlsx', 'xls', 'xlsm', 'csv'];
const FONT_EXTENSIONS = ['ttf', 'otf'];

export const DOCUMENT_PRESETS: Record<Exclude<DocumentPreset, 'any'>, DocumentPresetConfig> = {
  image: {
    mimeTypes: ['image/*', 'public.image', 'application/octet-stream'],
    extensions: new Set(IMAGE_EXTENSIONS),
  },
  excel: {
    mimeTypes: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/vnd.ms-excel.sheet.macroEnabled.12',
      'text/csv',
      'text/comma-separated-values',
      'public.spreadsheet',
      'public.composite-content',
      'application/octet-stream',
    ],
    extensions: new Set(EXCEL_EXTENSIONS),
  },
  csv: {
    mimeTypes: ['text/csv', 'text/comma-separated-values', 'public.comma-separated-values-text', 'application/octet-stream'],
    extensions: new Set(['csv']),
  },
  pdf: {
    mimeTypes: ['application/pdf', 'com.adobe.pdf'],
    extensions: new Set(['pdf']),
  },
  font: {
    mimeTypes: [
      'font/ttf',
      'font/otf',
      'application/x-font-ttf',
      'application/x-font-otf',
      'application/octet-stream',
      '*/*',
    ],
    extensions: new Set(FONT_EXTENSIONS),
  },
  svg: {
    mimeTypes: ['image/svg+xml', 'text/xml', 'application/xml', 'public.svg-image', '*/*'],
    extensions: new Set(['svg', 'xml']),
  },
  // Pickers filter by the type a provider reports, never by extension. A .seznik label file has no registered
  // type, so the system reports it as 'unknown' (octet-stream) or as a zip. That is the whole list:
  // PDFs, spreadsheets, documents, photos and video all have their own types and stay hidden. If a
  // phone reports something else, the type is learned the first time the file is picked from
  // "Show all files" (see learned-mime.ts).
  sezlabel: {
    mimeTypes: SEZLABEL_BASE_MIMES,
    extensions: new Set(['seznik', 'sezlabel', 'zip']),
  },
  clipart: {
    mimeTypes: [
      'image/svg+xml',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
      'public.svg-image',
      'public.image',
      'application/octet-stream',
      '*/*',
    ],
    extensions: new Set(['svg', 'xml', 'png', 'jpg', 'jpeg', 'webp']),
  },
};

const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/bmp': 'bmp',
  'image/tiff': 'tif',
  'application/pdf': 'pdf',
  'com.adobe.pdf': 'pdf',
  'text/csv': 'csv',
  'text/comma-separated-values': 'csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.ms-excel.sheet.macroEnabled.12': 'xlsm',
  'font/ttf': 'ttf',
  'application/x-font-ttf': 'ttf',
  'font/otf': 'otf',
  'application/x-font-otf': 'otf',
  'application/font-sfnt': 'ttf',
  'image/svg+xml': 'svg',
  'public.svg-image': 'svg',
};

export function extensionFromName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? name;
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return '';
  return base.slice(dot + 1).toLowerCase();
}

export function extensionFromMime(mimeType: string | null | undefined): string {
  if (!mimeType) return '';
  const normalized = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  return MIME_TO_EXTENSION[normalized] ?? '';
}
